import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { redis } from '../config/redis';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { JWTPayload } from '@comms/types';

export const notificationsRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
notificationsRouter.use(auth);

// GET /notifications
notificationsRouter.get('/', async (req: any, res: Response) => {
  try {
    const { isRead, cursor, limit = 30 } = req.query;
    const take = Math.min(parseInt(limit), 100);
    const where: any = { userId: req.user.sub };
    if (isRead !== undefined) where.isRead = isRead === 'true';
    if (cursor) where.createdAt = { lt: new Date(cursor as string) };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user.sub, isRead: false } }),
    ]);

    res.json({ success: true, data: notifications, meta: { unreadCount, hasMore: notifications.length === take } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// POST /notifications/read
notificationsRouter.post('/read', async (req: any, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: req.user.sub },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

// POST /notifications/read-all
notificationsRouter.post('/read-all', async (req: any, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.sub, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
});

// POST /notifications/push/subscribe
notificationsRouter.post('/push/subscribe', async (req: any, res: Response) => {
  try {
    const subscription = req.body;
    const userId = req.user.sub;
    const key = `push_subscriptions:${userId}`;
    const existing = JSON.parse((await redis.get(key)) || '[]');
    const updated = [...existing.filter((s: any) => s.endpoint !== subscription.endpoint), subscription];
    await redis.set(key, JSON.stringify(updated));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// DELETE /notifications/push/subscribe
notificationsRouter.delete('/push/subscribe', async (req: any, res: Response) => {
  const { endpoint } = req.body;
  const key = `push_subscriptions:${req.user.sub}`;
  const existing = JSON.parse((await redis.get(key)) || '[]');
  await redis.set(key, JSON.stringify(existing.filter((s: any) => s.endpoint !== endpoint)));
  res.json({ success: true });
});
