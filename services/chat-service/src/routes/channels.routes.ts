import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { generateSlug } from '@comms/utils';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('chat-service:channels');
export const channelsRouter = Router();

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

channelsRouter.use(auth);

// GET /channels — list accessible channels
channelsRouter.get('/', async (req: any, res: Response) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.sub;

    const channels = await prisma.channel.findMany({
      where: {
        tenantId,
        isArchived: false,
        OR: [
          { type: 'PUBLIC' },
          { type: 'ANNOUNCEMENT' },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: {
          where: { userId },
          select: { role: true, notificationPreference: true, isMuted: true, lastReadAt: true },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch channels' });
  }
});

// POST /channels — create channel
channelsRouter.post('/', async (req: any, res: Response) => {
  try {
    const body = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      type: z.enum(['PUBLIC', 'PRIVATE', 'ANNOUNCEMENT']).default('PUBLIC'),
      isReadOnly: z.boolean().default(false),
      memberIds: z.array(z.string()).default([]),
    }).parse(req.body);

    const slug = generateSlug(body.name);
    const tenantId = req.user.tenantId;
    const userId = req.user.sub;

    const channel = await prisma.channel.create({
      data: {
        tenantId,
        name: body.name,
        slug: `${slug}-${Date.now()}`.slice(0, 50),
        description: body.description,
        type: body.type,
        createdBy: userId,
        isReadOnly: body.isReadOnly,
        members: {
          create: [
            { userId, role: 'OWNER' },
            ...body.memberIds.filter((id) => id !== userId).map((id) => ({ userId: id, role: 'MEMBER' as const })),
          ],
        },
      },
      include: { _count: { select: { members: true } } },
    });

    res.status(201).json({ success: true, data: channel });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create channel' });
  }
});

// GET /channels/:id/members
channelsRouter.get('/:id/members', async (req: any, res: Response) => {
  try {
    const members = await prisma.channelMember.findMany({
      where: { channelId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, status: true, role: true } } },
    });
    const data = members.map(m => ({ ...m.user, channelRole: m.role }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

// GET /channels/:id
channelsRouter.get('/:id', async (req: any, res: Response) => {
  try {
    const channel = await prisma.channel.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, status: true, role: true } } },
        },
        _count: { select: { members: true } },
      },
    });

    if (!channel) { res.status(404).json({ success: false, error: 'Channel not found' }); return; }
    res.json({ success: true, data: channel });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch channel' });
  }
});

// PATCH /channels/:id
channelsRouter.patch('/:id', async (req: any, res: Response) => {
  try {
    const { name, description, topic, isReadOnly, retentionDays } = req.body;

    // Verify admin/owner
    const member = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: req.params.id, userId: req.user.sub } },
    });
    if (!member || !['OWNER', 'MODERATOR'].includes(member.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' }); return;
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.id },
      data: { name, description, topic, isReadOnly, retentionDays },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update channel' });
  }
});

// DELETE /channels/:id — archive
channelsRouter.delete('/:id', async (req: any, res: Response) => {
  try {
    const member = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: req.params.id, userId: req.user.sub } },
    });
    if (!member || member.role !== 'OWNER') {
      res.status(403).json({ success: false, error: 'Only the channel owner can archive it' }); return;
    }

    await prisma.channel.update({ where: { id: req.params.id }, data: { isArchived: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to archive channel' });
  }
});

// POST /channels/:id/members
channelsRouter.post('/:id/members', async (req: any, res: Response) => {
  try {
    const { userIds } = z.object({ userIds: z.array(z.string()) }).parse(req.body);
    await prisma.channelMember.createMany({
      data: userIds.map((uid) => ({ channelId: req.params.id, userId: uid, role: 'MEMBER' })),
      skipDuplicates: true,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add members' });
  }
});

// DELETE /channels/:id/members/:userId
channelsRouter.delete('/:id/members/:userId', async (req: any, res: Response) => {
  try {
    await prisma.channelMember.delete({
      where: { channelId_userId: { channelId: req.params.id, userId: req.params.userId } },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// GET /channels/browser
channelsRouter.get('/browser', async (req: any, res: Response) => {
  try {
    const { q } = req.query;
    const channels = await prisma.channel.findMany({
      where: {
        tenantId: req.user.tenantId,
        type: { in: ['PUBLIC', 'ANNOUNCEMENT'] },
        isArchived: false,
        ...(q ? { name: { contains: q as string, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { members: true } } },
      take: 50,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to browse channels' });
  }
});
