import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('chat-service:messages');
export const messagesRouter = Router();

// Auth middleware
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

messagesRouter.use(auth);

// GET /:channelId — alias for frontend compatibility, returns {messages, nextCursor}
messagesRouter.get('/:channelId', async (req: any, res: Response) => {
  try {
    const { channelId } = req.params;
    const { cursor, limit = '50' } = req.query;
    const take = Math.min(parseInt(limit as string), 100);

    const where: any = { channelId, deletedAt: null, parentId: null };
    if (cursor) where.createdAt = { lt: new Date(cursor as string) };

    const messages = await prisma.message.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true, role: true, status: true } },
        attachments: { where: { deletedAt: null } },
        reactions: { select: { emoji: true, userId: true } },
        _count: { select: { replies: { where: { deletedAt: null } } } },
      },
    });

    const formatted = messages.reverse().map((msg) => ({
      ...msg,
      user: msg.sender,
      reactions: aggregateReactions(msg.reactions, req.user.sub),
      replyCount: msg._count.replies,
    }));

    const nextCursor = messages.length === take ? messages[0]?.createdAt?.toISOString() : undefined;
    res.json({ success: true, messages: formatted, nextCursor });
  } catch (err) {
    logger.error('Get messages error', { err });
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// GET /channels/:id/messages — cursor pagination
messagesRouter.get('/channels/:channelId/messages', async (req: any, res: Response) => {
  try {
    const { channelId } = req.params;
    const { cursor, limit = 50, direction = 'before' } = req.query;

    const take = Math.min(parseInt(limit as string), 100);

    const where: any = {
      channelId,
      deletedAt: null,
      parentId: null, // only top-level messages
    };

    if (cursor) {
      where.createdAt = direction === 'before' ? { lt: new Date(cursor as string) } : { gt: new Date(cursor as string) };
    }

    const messages = await prisma.message.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true, role: true, status: true } },
        attachments: { where: { deletedAt: null } },
        reactions: { select: { emoji: true, userId: true } },
        pins: { select: { id: true } },
        _count: { select: { replies: { where: { deletedAt: null } } } },
      },
    });

    const formatted = messages.reverse().map((msg) => ({
      ...msg,
      reactions: aggregateReactions(msg.reactions, req.user.sub),
      replyCount: msg._count.replies,
      isPinned: msg.pins.length > 0,
    }));

    const nextCursor = messages.length === take ? messages[0]?.createdAt?.toISOString() : null;

    res.json({
      success: true,
      data: formatted,
      meta: { nextCursor, hasMore: !!nextCursor },
    });
  } catch (err) {
    logger.error('Get messages error', { err });
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// GET /channels/:id/thread/:messageId — thread replies
messagesRouter.get('/channels/:channelId/thread/:messageId', async (req: any, res: Response) => {
  try {
    const { messageId } = req.params;
    const { cursor, limit = 50 } = req.query;

    const replies = await prisma.message.findMany({
      where: {
        parentId: messageId,
        deletedAt: null,
        ...(cursor ? { createdAt: { gt: new Date(cursor as string) } } : {}),
      },
      take: Math.min(parseInt(limit as string), 100),
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        reactions: { select: { emoji: true, userId: true } },
        attachments: { where: { deletedAt: null } },
      },
    });

    res.json({
      success: true,
      data: replies.map((r) => ({ ...r, reactions: aggregateReactions(r.reactions, req.user.sub) })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch thread' });
  }
});

// GET /channels/:id/pins
messagesRouter.get('/channels/:channelId/pins', async (req: Request, res: Response) => {
  try {
    const pins = await prisma.messagePin.findMany({
      where: { channelId: req.params.channelId },
      orderBy: { pinnedAt: 'desc' },
      include: {
        message: {
          include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });
    res.json({ success: true, data: pins });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch pins' });
  }
});

// GET /users/me/saved — saved messages
messagesRouter.get('/users/me/saved', async (req: any, res: Response) => {
  try {
    const saved = await prisma.savedMessage.findMany({
      where: { userId: req.user.sub },
      orderBy: { savedAt: 'desc' },
      take: 50,
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
            channel: { select: { id: true, name: true } },
          },
        },
      },
    });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch saved messages' });
  }
});

// GET /channels/:id/files
messagesRouter.get('/channels/:channelId/files', async (req: Request, res: Response) => {
  try {
    const files = await prisma.attachment.findMany({
      where: { channelId: req.params.channelId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { uploader: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch files' });
  }
});

function aggregateReactions(
  reactions: { emoji: string; userId: string }[],
  currentUserId: string
): { emoji: string; count: number; users: string[]; hasReacted: boolean }[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji)!.push(r.userId);
  }
  return [...map.entries()].map(([emoji, users]) => ({
    emoji,
    count: users.length,
    users,
    hasReacted: users.includes(currentUserId),
  }));
}
