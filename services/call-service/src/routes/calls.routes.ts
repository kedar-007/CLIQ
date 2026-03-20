import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createRoom, generateParticipantToken, endRoom, listParticipants } from '../services/livekit.service';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('call-service:routes');
export const callsRouter = Router();

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

// POST /calls/start — initiate a new call session
callsRouter.post('/start', async (req: any, res: Response) => {
  try {
    const { channelId, type = 'VIDEO', participantIds = [] } = z.object({
      channelId: z.string().optional(),
      type: z.enum(['AUDIO', 'VIDEO', 'WEBINAR', 'TOWNHALL']).default('VIDEO'),
      participantIds: z.array(z.string()).default([]),
    }).parse(req.body);

    const userId = req.user.sub;
    const tenantId = req.user.tenantId;
    const roomName = `call-${tenantId}-${Date.now()}`;

    // Create LiveKit room
    await createRoom(roomName, { maxParticipants: type === 'WEBINAR' ? 10000 : 1000 });

    // Create DB record
    const callSession = await prisma.callSession.create({
      data: {
        tenantId,
        channelId,
        liveKitRoomId: roomName,
        type,
        startedBy: userId,
        participantCount: 1,
        participants: {
          create: { userId, role: 'HOST', audioEnabled: true, videoEnabled: type === 'VIDEO' },
        },
      },
    });

    // Generate join token for starter
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const token = await generateParticipantToken({
      roomName,
      userId,
      userName: user?.name || userId,
      role: 'HOST',
    });

    res.status(201).json({
      success: true,
      data: {
        callSessionId: callSession.id,
        roomName,
        token,
        livekitUrl: process.env.LIVEKIT_URL,
      },
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
    const user = await prisma.user.findUnique({ where: { id: userId } });

    await prisma.callParticipant.upsert({
      where: {
        callSessionId_userId: { callSessionId: callSession.id, userId },
      } as any,
      create: { callSessionId: callSession.id, userId, role: 'ATTENDEE', audioEnabled: true, videoEnabled: false },
      update: { joinedAt: new Date(), leftAt: null },
    });

    await prisma.callSession.update({
      where: { id: callSession.id },
      data: { participantCount: { increment: 1 } },
    });

    const token = generateParticipantToken({
      roomName: callSession.liveKitRoomId!,
      userId,
      userName: user?.name || userId,
      role: 'ATTENDEE',
    });

    res.json({
      success: true,
      data: { token, roomName: callSession.liveKitRoomId, livekitUrl: process.env.LIVEKIT_URL },
    });
  } catch (err) {
    logger.error('Join call error', { err });
    res.status(500).json({ success: false, error: 'Failed to join call' });
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

    if (callSession.liveKitRoomId) {
      await endRoom(callSession.liveKitRoomId).catch(() => {});
    }

    await prisma.callSession.update({
      where: { id: callSession.id },
      data: { endedAt: new Date() },
    });

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
    if (!callSession?.liveKitRoomId) {
      res.status(404).json({ success: false, error: 'Call not found' }); return;
    }

    const lkParticipants = await listParticipants(callSession.liveKitRoomId).catch(() => []);
    const dbParticipants = await prisma.callParticipant.findMany({
      where: { callSessionId: req.params.id, leftAt: null },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    res.json({ success: true, data: { participants: dbParticipants, count: lkParticipants.length } });
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
