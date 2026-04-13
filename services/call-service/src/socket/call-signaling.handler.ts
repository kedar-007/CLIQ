import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type {
  CallClientToServerEvents,
  CallRoomParticipant,
  CallServerToClientEvents,
  JWTPayload,
  WebRTCMediaState,
} from '@comms/types';

const logger = createLogger('call-service:signaling');

type CallSocket = Socket<CallClientToServerEvents, CallServerToClientEvents> & {
  user?: JWTPayload;
};

const roomMembers = new Map<string, Map<string, CallRoomParticipant>>();

function getSocketUser(socket: CallSocket): JWTPayload | null {
  return socket.user ?? null;
}

function getRoomKey(callSessionId: string): string {
  return `call:${callSessionId}`;
}

async function upsertParticipantState(params: {
  callSessionId: string;
  userId: string;
  media: WebRTCMediaState;
}) {
  const existingParticipant = await prisma.callParticipant.findFirst({
    where: {
      callSessionId: params.callSessionId,
      userId: params.userId,
    },
    orderBy: { joinedAt: 'desc' },
  });

  if (existingParticipant) {
    await prisma.callParticipant.update({
      where: { id: existingParticipant.id },
      data: {
        leftAt: null,
        audioEnabled: params.media.audioEnabled,
        videoEnabled: params.media.videoEnabled,
        screenSharing: params.media.screenSharing,
      },
    });
    return;
  }

  await prisma.callParticipant.create({
    data: {
      callSessionId: params.callSessionId,
      userId: params.userId,
      role: 'ATTENDEE',
      audioEnabled: params.media.audioEnabled,
      videoEnabled: params.media.videoEnabled,
      screenSharing: params.media.screenSharing,
    },
  });
}

async function leaveRoom(io: Server, socket: CallSocket, callSessionId: string): Promise<void> {
  const user = getSocketUser(socket);
  if (!user) return;

  const members = roomMembers.get(callSessionId);
  if (members) {
    members.delete(user.sub);
    if (members.size === 0) {
      roomMembers.delete(callSessionId);
    }
  }

  socket.leave(getRoomKey(callSessionId));

  await prisma.callParticipant.updateMany({
    where: {
      callSessionId,
      userId: user.sub,
      leftAt: null,
    },
    data: { leftAt: new Date() },
  });

  const activeCount = members?.size ?? 0;
  const shouldEndCallForEveryone = activeCount <= 1;
  await prisma.callSession.update({
    where: { id: callSessionId },
    data: {
      participantCount: shouldEndCallForEveryone ? 0 : activeCount,
      ...(shouldEndCallForEveryone ? { endedAt: new Date() } : {}),
    },
  }).catch(() => {});

  socket.to(getRoomKey(callSessionId)).emit('call:user-left', {
    callSessionId,
    userId: user.sub,
  });

  if (shouldEndCallForEveryone) {
    await prisma.callParticipant.updateMany({
      where: { callSessionId, leftAt: null },
      data: { leftAt: new Date() },
    }).catch(() => {});

    io.to(getRoomKey(callSessionId)).emit('call:ended', {
      callSessionId,
    });

    roomMembers.delete(callSessionId);
  }
}

export function registerCallSignaling(io: Server): void {
  io.use((socket: CallSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      socket.user = jwt.verify(token as string, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
      next();
    } catch {
      next(new Error('Invalid access token'));
    }
  });

  io.on('connection', (socket: CallSocket) => {
    const user = getSocketUser(socket);
    if (!user) return;

    socket.on('call:join-room', async ({ callSessionId }) => {
      try {
        const callSession = await prisma.callSession.findUnique({
          where: { id: callSessionId },
        });

        if (!callSession || callSession.tenantId !== user.tenantId || callSession.endedAt) {
          socket.emit('call:error', { message: 'Call session is unavailable.' });
          return;
        }

        const profile = await prisma.user.findUnique({
          where: { id: user.sub },
          select: { id: true, name: true, avatarUrl: true, email: true },
        });

        const displayName =
          profile?.name?.trim() ||
          profile?.email?.split('@')[0] ||
          user.email.split('@')[0] ||
          'Participant';

        const participant: CallRoomParticipant = {
          userId: user.sub,
          socketId: socket.id,
          name: displayName,
          avatarUrl: profile?.avatarUrl || undefined,
          joinedAt: new Date().toISOString(),
          media: {
            audioEnabled: true,
            videoEnabled: callSession.type !== 'AUDIO',
            screenSharing: false,
          },
        };

        const members = roomMembers.get(callSessionId) ?? new Map<string, CallRoomParticipant>();
        roomMembers.set(callSessionId, members);
        members.set(user.sub, participant);

        socket.join(getRoomKey(callSessionId));

        await upsertParticipantState({
          callSessionId,
          userId: user.sub,
          media: participant.media,
        });

        await prisma.callSession.update({
          where: { id: callSessionId },
          data: { participantCount: members.size, endedAt: null },
        }).catch(() => {});

        socket.emit('call:room-state', {
          callSessionId,
          roomId: callSession.liveKitRoomId || callSession.id,
          participants: [...members.values()].filter((member) => member.userId !== user.sub),
        });

        socket.to(getRoomKey(callSessionId)).emit('call:user-joined', {
          callSessionId,
          participant,
        });
      } catch (error) {
        logger.error('Failed to join call room', { error, callSessionId, userId: user.sub });
        socket.emit('call:error', { message: 'Failed to join call room.' });
      }
    });

    socket.on('call:signal', ({ callSessionId, toUserId, payload }) => {
      const members = roomMembers.get(callSessionId);
      const target = members?.get(toUserId);
      if (!target) return;

      io.to(target.socketId).emit('call:signal', {
        callSessionId,
        fromUserId: user.sub,
        payload,
      });
    });

    socket.on('call:media-state', async ({ callSessionId, media }) => {
      const members = roomMembers.get(callSessionId);
      const participant = members?.get(user.sub);
      if (!participant) return;

      participant.media = media;
      members?.set(user.sub, participant);

      await prisma.callParticipant.updateMany({
        where: { callSessionId, userId: user.sub, leftAt: null },
        data: {
          audioEnabled: media.audioEnabled,
          videoEnabled: media.videoEnabled,
          screenSharing: media.screenSharing,
        },
      }).catch(() => {});

      socket.to(getRoomKey(callSessionId)).emit('call:media-state', {
        callSessionId,
        userId: user.sub,
        media,
      });
    });

    socket.on('call:reaction', ({ callSessionId, reaction, raisedHand }) => {
      io.to(getRoomKey(callSessionId)).emit('call:reaction', {
        callSessionId,
        userId: user.sub,
        reaction,
        raisedHand,
      });
    });

    socket.on('call:leave-room', async ({ callSessionId }) => {
      await leaveRoom(io, socket, callSessionId);
    });

    socket.on('disconnect', async () => {
      const roomEntries = [...roomMembers.entries()].filter(([, members]) => members.has(user.sub));
      await Promise.all(roomEntries.map(([callSessionId]) => leaveRoom(io, socket, callSessionId)));
    });
  });
}
