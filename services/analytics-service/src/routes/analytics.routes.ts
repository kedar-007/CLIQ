import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@comms/types';
import { subDays, startOfDay } from 'date-fns';

export const analyticsRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
analyticsRouter.use(auth);

function requireAdmin(req: any, res: Response, next: () => void): void {
  if (!['OWNER', 'ADMIN'].includes(req.user.role)) {
    res.status(403).json({ success: false, error: 'Admin access required' }); return;
  }
  next();
}

// GET /analytics/overview
analyticsRouter.get('/overview', auth, requireAdmin, async (req: any, res: Response) => {
  try {
    const tenantId = req.user.tenantId;
    const days = parseInt(req.query.days as string || '30');
    const since = subDays(new Date(), days);

    const [
      totalUsers,
      activeUsers,
      totalChannels,
      totalMessages,
      totalCalls,
      storageResult,
      newUsersToday,
      messagesToday,
    ] = await Promise.all([
      prisma.user.count({ where: { tenantId, isDeactivated: false } }),
      prisma.user.count({ where: { tenantId, lastSeen: { gte: since } } }),
      prisma.channel.count({ where: { tenantId, isArchived: false } }),
      prisma.message.count({ where: { channel: { tenantId }, deletedAt: null, createdAt: { gte: since } } }),
      prisma.callSession.count({ where: { tenantId, startedAt: { gte: since } } }),
      prisma.attachment.aggregate({ where: { channel: { tenantId }, deletedAt: null }, _sum: { fileSize: true } }),
      prisma.user.count({ where: { tenantId, createdAt: { gte: startOfDay(new Date()) } } }),
      prisma.message.count({ where: { channel: { tenantId }, deletedAt: null, createdAt: { gte: startOfDay(new Date()) } } }),
    ]);

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers, newToday: newUsersToday },
        channels: { total: totalChannels },
        messages: { period: totalMessages, today: messagesToday },
        calls: { period: totalCalls },
        storage: { bytes: storageResult._sum.fileSize || 0, mb: Math.round((storageResult._sum.fileSize || 0) / (1024 * 1024)) },
        period: { days, since },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// GET /analytics/messages/daily
analyticsRouter.get('/messages/daily', auth, requireAdmin, async (req: any, res: Response) => {
  try {
    const tenantId = req.user.tenantId;
    const days = parseInt(req.query.days as string || '30');

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const start = startOfDay(date);
      const end = new Date(start.getTime() + 86400000);
      const count = await prisma.message.count({
        where: { channel: { tenantId }, deletedAt: null, createdAt: { gte: start, lt: end } },
      });
      data.push({ date: start.toISOString().split('T')[0], count });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch message analytics' });
  }
});

// GET /analytics/top-channels
analyticsRouter.get('/top-channels', auth, requireAdmin, async (req: any, res: Response) => {
  try {
    const tenantId = req.user.tenantId;
    const since = subDays(new Date(), 30);

    const channels = await prisma.channel.findMany({
      where: { tenantId, isArchived: false },
      include: {
        _count: {
          select: {
            members: true,
            messages: { where: { deletedAt: null, createdAt: { gte: since } } },
          },
        },
      },
      take: 10,
      orderBy: { members: { _count: 'desc' } },
    });

    const sorted = channels
      .map((c) => ({ id: c.id, name: c.name, type: c.type, memberCount: c._count.members, messageCount30d: c._count.messages }))
      .sort((a, b) => b.messageCount30d - a.messageCount30d);

    res.json({ success: true, data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch channel analytics' });
  }
});

// GET /analytics/users/activity
analyticsRouter.get('/users/activity', auth, requireAdmin, async (req: any, res: Response) => {
  try {
    const tenantId = req.user.tenantId;
    const since = subDays(new Date(), 30);

    const activeUsers = await prisma.user.findMany({
      where: { tenantId, isDeactivated: false, lastSeen: { gte: since } },
      select: { id: true, name: true, avatarUrl: true, lastSeen: true, status: true, department: true, role: true },
      orderBy: { lastSeen: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: activeUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
  }
});
