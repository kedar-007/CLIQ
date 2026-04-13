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

async function resolveChannelForEmailInvite(params: {
  tenantId: string;
  callerUserId: string;
  userEmails: string[];
}): Promise<string> {
  const normalizedEmails = [...new Set(params.userEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const invitedUsers = await prisma.user.findMany({
    where: {
      tenantId: params.tenantId,
      email: { in: normalizedEmails },
      isDeactivated: false,
    },
    select: { id: true, email: true, name: true },
  });

  const foundEmails = new Set(invitedUsers.map((user) => user.email.toLowerCase()));
  const missingEmails = normalizedEmails.filter((email) => !foundEmails.has(email));
  if (missingEmails.length > 0) {
    throw new Error(`Could not find active users for: ${missingEmails.join(', ')}`);
  }

  const memberIds = [...new Set([params.callerUserId, ...invitedUsers.map((user) => user.id)])];
  if (memberIds.length === 2) {
    const dmSlug = `dm-${[...memberIds].sort().join('-')}`;
    let channel = await prisma.channel.findFirst({
      where: { tenantId: params.tenantId, slug: dmSlug, type: 'DM' },
      select: { id: true },
    });

    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          tenantId: params.tenantId,
          name: dmSlug,
          slug: dmSlug,
          type: 'DM',
          createdBy: params.callerUserId,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role: userId === params.callerUserId ? 'OWNER' : 'MEMBER',
            })),
          },
        },
        select: { id: true },
      });
    }

    return channel.id;
  }

  const groupLabel = invitedUsers
    .slice(0, 3)
    .map((user) => user.name?.trim() || user.email.split('@')[0])
    .join(', ');

  const channel = await prisma.channel.create({
    data: {
      tenantId: params.tenantId,
      name: groupLabel ? `Call: ${groupLabel}` : 'Call group',
      slug: `call-group-${Date.now()}`,
      type: 'GROUP_DM',
      createdBy: params.callerUserId,
      members: {
        create: memberIds.map((userId) => ({
          userId,
          role: userId === params.callerUserId ? 'OWNER' : 'MEMBER',
        })),
      },
    },
    select: { id: true },
  });

  return channel.id;
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

    const unreadInvite = await prisma.notification.findFirst({
      where: {
        userId,
        tenantId,
        type: 'CALL_INCOMING',
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    const invitedCallSessionId =
      unreadInvite && unreadInvite.data && typeof (unreadInvite.data as Record<string, unknown>).callSessionId === 'string'
        ? ((unreadInvite.data as Record<string, unknown>).callSessionId as string)
        : null;

    if (invitedCallSessionId) {
      const invitedCall = await prisma.callSession.findUnique({
        where: { id: invitedCallSessionId },
      });

      if (invitedCall && !invitedCall.endedAt) {
        const [caller, channel] = await Promise.all([
          prisma.user.findUnique({
            where: { id: invitedCall.startedBy },
            select: { id: true, name: true, avatarUrl: true },
          }),
          invitedCall.channelId
            ? prisma.channel.findUnique({
                where: { id: invitedCall.channelId },
                select: { id: true, name: true, type: true },
              })
            : Promise.resolve(null),
        ]);

        res.json({
          success: true,
          data: {
            callSessionId: invitedCall.id,
            channelId: invitedCall.channelId,
            channelName: channel?.name,
            channelType: channel?.type,
            roomId: invitedCall.liveKitRoomId || invitedCall.id,
            callType: invitedCall.type,
            fromUserId: caller?.id || invitedCall.startedBy,
            fromUserName: caller?.name || 'A teammate',
            fromUserAvatarUrl: caller?.avatarUrl || null,
            startedAt: invitedCall.startedAt,
          },
        });
        return;
      }
    }

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

callsRouter.post('/:id/invite', async (req: any, res: Response) => {
  try {
    const { userIds = [], userEmails = [] } = z.object({
      userIds: z.array(z.string()).optional(),
      userEmails: z.array(z.string().email()).optional(),
    }).parse(req.body);

    const callSession = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!callSession || callSession.endedAt) {
      res.status(404).json({ success: false, error: 'Call not found or ended' });
      return;
    }

    const requesterId = req.user.sub;
    const activeParticipant = await prisma.callParticipant.findFirst({
      where: { callSessionId: callSession.id, userId: requesterId, leftAt: null },
    });

    if (!activeParticipant && callSession.startedBy !== requesterId) {
      res.status(403).json({ success: false, error: 'Only active participants can invite others' });
      return;
    }

    const emailUsers = userEmails.length
      ? await prisma.user.findMany({
          where: {
            tenantId: req.user.tenantId,
            email: { in: userEmails.map((email) => email.trim().toLowerCase()) },
            isDeactivated: false,
          },
          select: { id: true },
        })
      : [];

    const targetUserIds = [...new Set([...userIds, ...emailUsers.map((user) => user.id)])].filter(
      (candidateId) => candidateId && candidateId !== requesterId
    );

    if (targetUserIds.length === 0) {
      res.status(400).json({ success: false, error: 'Select at least one teammate to invite' });
      return;
    }

    const inviter = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { name: true, avatarUrl: true },
    });
    const title = await resolveCallTitle(callSession.channelId, requesterId);

    await prisma.notification.createMany({
      data: targetUserIds.map((targetUserId) => ({
        userId: targetUserId,
        tenantId: req.user.tenantId,
        type: 'CALL_INCOMING',
        title: `${inviter?.name || 'A teammate'} invited you to a call`,
        body: callSession.type === 'VIDEO' ? 'Join the live video call' : 'Join the live audio call',
        data: {
          callSessionId: callSession.id,
          channelId: callSession.channelId,
          callType: callSession.type,
          roomId: callSession.liveKitRoomId || callSession.id,
          fromUserId: requesterId,
          fromUserName: inviter?.name || 'A teammate',
          fromUserAvatarUrl: inviter?.avatarUrl || null,
          title,
        },
        channelId: callSession.channelId || undefined,
      })),
    });

    res.json({ success: true, data: { invitedUserIds: targetUserIds } });
  } catch (err) {
    logger.error('Invite to call error', { err });
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to invite teammates' });
  }
});

// POST /calls/start — initiate a new call session
callsRouter.post('/start', async (req: any, res: Response) => {
  try {
    const { channelId, userEmails = [], type = 'VIDEO' } = z.object({
      channelId: z.string().optional(),
      userEmails: z.array(z.string().email()).optional(),
      type: z.enum(['AUDIO', 'VIDEO']).default('VIDEO'),
    }).parse(req.body);

    const userId = req.user.sub;
    const tenantId = req.user.tenantId;
    const resolvedChannelId =
      channelId ||
      (userEmails.length > 0
        ? await resolveChannelForEmailInvite({
            tenantId,
            callerUserId: userId,
            userEmails,
          })
        : undefined);
    const roomId = `room_${tenantId}_${Date.now()}`;

    const callSession = await prisma.callSession.create({
      data: {
        tenantId,
        channelId: resolvedChannelId,
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
    const title = await resolveCallTitle(resolvedChannelId, userId);

    if (resolvedChannelId) {
      const recipients = await prisma.channelMember.findMany({
        where: {
          channelId: resolvedChannelId,
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
              channelId: resolvedChannelId,
              callType: type,
              roomId,
              fromUserId: userId,
              fromUserName: user?.name || 'A teammate',
              fromUserAvatarUrl: user?.avatarUrl || null,
            },
            channelId: resolvedChannelId,
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
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to start call' });
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
