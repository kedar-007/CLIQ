import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import type { CallJoinConfig, JWTPayload } from '@comms/types';
import { getIceServers } from '../services/ice-servers.service';

const logger = createLogger('call-service:routes');
export const callsRouter = Router();

function buildJoinConfig(params: {
  callSessionId: string;
  roomId: string;
  title?: string;
  type: 'AUDIO' | 'VIDEO';
  user: { id: string; name: string; avatarUrl?: string | null };
}): CallJoinConfig {
  return {
    callSessionId: params.callSessionId,
    roomId: params.roomId,
    title: params.title,
    callType: params.type,
    signalingUrl: process.env.CALL_SIGNALING_URL || process.env.CALL_SERVICE_URL || 'http://localhost:3003',
    iceServers: getIceServers(),
    participant: {
      id: params.user.id,
      name: params.user.name,
      avatarUrl: params.user.avatarUrl || undefined,
    },
  };
}

async function resolveCallTitle(channelId: string | null | undefined, currentUserId: string): Promise<string | undefined> {
  if (!channelId) return undefined;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!channel) return undefined;

  if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
    const names = channel.members
      .map((member) => member.user)
      .filter((member): member is NonNullable<typeof member> => Boolean(member))
      .filter((member) => member.id !== currentUserId)
      .map((member) => member.name?.trim() || member.email.split('@')[0])
      .filter(Boolean);

    if (names.length > 0) {
      return names.join(', ');
    }
  }

  return channel.name;
}

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}
callsRouter.use(auth);

// GET /calls/incoming — active call for the current user via channel membership
callsRouter.get('/incoming', async (req: any, res: Response) => {
  try {
    const userId = req.user.sub;
    const tenantId = req.user.tenantId;

    const memberships = await prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });

    const channelIds = memberships.map((membership) => membership.channelId);
    if (channelIds.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    const activeCall = await prisma.callSession.findFirst({
      where: {
        tenantId,
        endedAt: null,
        channelId: { in: channelIds },
        startedBy: { not: userId },
        participants: {
          none: { userId },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeCall) {
      res.json({ success: true, data: null });
      return;
    }

    const [caller, channel] = await Promise.all([
      prisma.user.findUnique({
        where: { id: activeCall.startedBy },
        select: { id: true, name: true, avatarUrl: true },
      }),
      activeCall.channelId
        ? prisma.channel.findUnique({
            where: { id: activeCall.channelId },
            select: { id: true, name: true, type: true },
          })
        : Promise.resolve(null),
    ]);

    res.json({
      success: true,
      data: {
        callSessionId: activeCall.id,
        channelId: activeCall.channelId,
        channelName: channel?.name,
        channelType: channel?.type,
        roomId: activeCall.liveKitRoomId || activeCall.id,
        callType: activeCall.type,
        fromUserId: caller?.id || activeCall.startedBy,
        fromUserName: caller?.name || 'A teammate',
        fromUserAvatarUrl: caller?.avatarUrl || null,
        startedAt: activeCall.startedAt,
      },
    });
  } catch (err) {
    logger.error('Incoming call lookup error', { err });
    res.status(500).json({ success: false, error: 'Failed to fetch incoming call' });
  }
});

// POST /calls/start — initiate a new call session
callsRouter.post('/start', async (req: any, res: Response) => {
  try {
    const { channelId, type = 'VIDEO' } = z.object({
      channelId: z.string().optional(),
      type: z.enum(['AUDIO', 'VIDEO']).default('VIDEO'),
    }).parse(req.body);

    const userId = req.user.sub;
    const tenantId = req.user.tenantId;
    const roomId = `room_${tenantId}_${Date.now()}`;

    const callSession = await prisma.callSession.create({
      data: {
        tenantId,
        channelId,
        liveKitRoomId: roomId,
        type,
        startedBy: userId,
        participantCount: 1,
        participants: {
          create: { userId, role: 'HOST', audioEnabled: true, videoEnabled: type === 'VIDEO' },
        },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatarUrl: true },
    });
    const title = await resolveCallTitle(channelId, userId);

    if (channelId) {
      const recipients = await prisma.channelMember.findMany({
        where: {
          channelId,
          userId: { not: userId },
        },
        select: { userId: true },
      });

      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((recipient) => ({
            userId: recipient.userId,
            tenantId,
            type: 'CALL_INCOMING',
            title: `${user?.name || 'A teammate'} is calling`,
            body: type === 'VIDEO' ? 'Incoming video call' : 'Incoming audio call',
            data: {
              callSessionId: callSession.id,
              channelId,
              callType: type,
              roomId,
              fromUserId: userId,
              fromUserName: user?.name || 'A teammate',
              fromUserAvatarUrl: user?.avatarUrl || null,
            },
            channelId,
          })),
          skipDuplicates: false,
        });
      }
    }

    res.status(201).json({
      success: true,
      data: buildJoinConfig({
        callSessionId: callSession.id,
        roomId,
        title,
        type,
        user: user || { id: userId, name: userId },
      }),
    });
  } catch (err) {
    logger.error('Start call error', { err });
    res.status(500).json({ success: false, error: 'Failed to start call' });
  }
});

// POST /calls/:id/join
callsRouter.post('/:id/join', async (req: any, res: Response) => {
  try {
    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession || callSession.endedAt) {
      res.status(404).json({ success: false, error: 'Call not found or ended' });
      return;
    }

    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatarUrl: true },
    });
    const title = await resolveCallTitle(callSession.channelId, userId);

    const existingParticipant = await prisma.callParticipant.findFirst({
      where: { callSessionId: callSession.id, userId },
      orderBy: { joinedAt: 'desc' },
    });

    if (existingParticipant) {
      await prisma.callParticipant.update({
        where: { id: existingParticipant.id },
        data: {
          joinedAt: new Date(),
          leftAt: null,
          audioEnabled: true,
          videoEnabled: callSession.type === 'VIDEO',
        },
      });
    } else {
      await prisma.callParticipant.create({
        data: {
          callSessionId: callSession.id,
          userId,
          role: 'ATTENDEE',
          audioEnabled: true,
          videoEnabled: callSession.type === 'VIDEO',
        },
      });
    }

    const updatedCallSession = await prisma.callSession.update({
      where: { id: callSession.id },
      data: { participantCount: { increment: 1 } },
    });

    res.json({
      success: true,
      data: buildJoinConfig({
        callSessionId: callSession.id,
        roomId: updatedCallSession.liveKitRoomId || updatedCallSession.id,
        title,
        type: updatedCallSession.type as 'AUDIO' | 'VIDEO',
        user: user || { id: userId, name: userId },
      }),
    });
  } catch (err) {
    logger.error('Join call error', { err });
    res.status(500).json({ success: false, error: 'Failed to join call' });
  }
});

// POST /calls/:id/decline
callsRouter.post('/:id/decline', async (req: any, res: Response) => {
  try {
    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession || callSession.endedAt) {
      res.status(404).json({ success: false, error: 'Call not found or ended' });
      return;
    }

    const userId = req.user.sub;
    const existingParticipant = await prisma.callParticipant.findFirst({
      where: { callSessionId: callSession.id, userId },
      orderBy: { joinedAt: 'desc' },
    });

    if (existingParticipant) {
      await prisma.callParticipant.update({
        where: { id: existingParticipant.id },
        data: { leftAt: existingParticipant.leftAt || new Date() },
      });
    } else {
      await prisma.callParticipant.create({
        data: {
          callSessionId: callSession.id,
          userId,
          role: 'ATTENDEE',
          audioEnabled: false,
          videoEnabled: false,
          leftAt: new Date(),
        },
      });
    }

    await prisma.notification.updateMany({
      where: {
        userId,
        type: 'CALL_INCOMING',
        isRead: false,
        data: {
          path: ['callSessionId'],
          equals: callSession.id,
        },
      },
      data: { isRead: true, readAt: new Date() },
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    logger.error('Decline call error', { err });
    res.status(500).json({ success: false, error: 'Failed to decline call' });
  }
});

// POST /calls/:id/end
callsRouter.post('/:id/end', async (req: any, res: Response) => {
  try {
    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession) { res.status(404).json({ success: false, error: 'Call not found' }); return; }

    if (callSession.startedBy !== req.user.sub) {
      // Check if HOST participant
      const participant = await prisma.callParticipant.findFirst({
        where: { callSessionId: callSession.id, userId: req.user.sub, role: 'HOST' },
      });
      if (!participant) {
        res.status(403).json({ success: false, error: 'Only the host can end the call' }); return;
      }
    }

    await prisma.callSession.update({
      where: { id: callSession.id },
      data: { endedAt: new Date(), participantCount: 0 },
    });

    await prisma.callParticipant.updateMany({
      where: { callSessionId: callSession.id, leftAt: null },
      data: { leftAt: new Date() },
    });

    await prisma.notification.updateMany({
      where: {
        type: 'CALL_INCOMING',
        isRead: false,
        data: {
          path: ['callSessionId'],
          equals: callSession.id,
        },
      },
      data: { isRead: true, readAt: new Date() },
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to end call' });
  }
});

// GET /calls/history
callsRouter.get('/history', async (req: any, res: Response) => {
  try {
    const calls = await prisma.callSession.findMany({
      where: {
        tenantId: req.user.tenantId,
        participants: { some: { userId: req.user.sub } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });
    res.json({ success: true, data: calls });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch call history' });
  }
});

// GET /calls/:id/participants
callsRouter.get('/:id/participants', async (req: any, res: Response) => {
  try {
    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession) {
      res.status(404).json({ success: false, error: 'Call not found' }); return;
    }

    const dbParticipants = await prisma.callParticipant.findMany({
      where: { callSessionId: req.params.id, leftAt: null },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    res.json({ success: true, data: { participants: dbParticipants, count: dbParticipants.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch participants' });
  }
});

// GET /calls/:id/summary — AI-generated summary
callsRouter.get('/:id/summary', async (req: any, res: Response) => {
  try {
    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession) { res.status(404).json({ success: false, error: 'Call not found' }); return; }
    res.json({ success: true, data: { summary: callSession.summaryText, transcriptUrl: callSession.transcriptUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
});
