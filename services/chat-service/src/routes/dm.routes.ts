import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import jwt from 'jsonwebtoken';
import { generateSlug } from '@comms/utils';
import type { JWTPayload } from '@comms/types';

export const dmRouter = Router();

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

dmRouter.use(auth);

// POST /dm — create or get 1-on-1 DM
dmRouter.post('/', async (req: any, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.sub;
    const tenantId = req.user.tenantId;

    const sortedIds = [userId, targetUserId].sort();
    const dmSlug = `dm-${sortedIds.join('-')}`;

    let channel = await prisma.channel.findFirst({
      where: { tenantId, slug: dmSlug, type: 'DM' },
      include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true, status: true } } } } },
    });

    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          tenantId,
          name: dmSlug,
          slug: dmSlug,
          type: 'DM',
          createdBy: userId,
          members: {
            create: [
              { userId, role: 'MEMBER' },
              { userId: targetUserId, role: 'MEMBER' },
            ],
          },
        },
        include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true, status: true } } } } },
      });
    }

    res.json({ success: true, data: channel });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create DM' });
  }
});

// POST /dm/group — create group DM
dmRouter.post('/group', async (req: any, res: Response) => {
  try {
    const { userIds, name } = req.body;
    const userId = req.user.sub;
    const tenantId = req.user.tenantId;

    const allUserIds = [...new Set([userId, ...userIds])];
    if (allUserIds.length > 50) {
      res.status(400).json({ success: false, error: 'Group DMs are limited to 50 participants' });
      return;
    }

    const channel = await prisma.channel.create({
      data: {
        tenantId,
        name: name || `Group DM`,
        slug: `group-dm-${Date.now()}`,
        type: 'GROUP_DM',
        createdBy: userId,
        members: {
          create: allUserIds.map((uid) => ({ userId: uid, role: uid === userId ? 'OWNER' as const : 'MEMBER' as const })),
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true, status: true } } } },
      },
    });

    res.status(201).json({ success: true, data: channel });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create group DM' });
  }
});
