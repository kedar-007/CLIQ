import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { elasticsearchService } from '../services/elasticsearch.service';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@comms/types';

export const searchRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
searchRouter.use(auth);

// GET /search — global search
searchRouter.get('/', async (req: any, res: Response) => {
  try {
    const { q, in: channelId, from: fromUser, before, after, hasFile, hasLink, page = 0, limit = 20 } = req.query;
    if (!q || (q as string).length < 2) {
      res.status(400).json({ success: false, error: 'Query must be at least 2 characters' }); return;
    }

    const result = await elasticsearchService.searchGlobal({
      query: q as string,
      tenantId: req.user.tenantId,
      filters: {
        ...(channelId && { channelId }),
        ...(fromUser && { senderId: fromUser }),
        ...(before && { to: before }),
        ...(after && { from: after }),
        ...(hasFile === 'true' && { hasAttachments: true }),
        ...(hasLink === 'true' && { hasLinks: true }),
      },
      from: parseInt(page as string) * parseInt(limit as string),
      size: parseInt(limit as string),
    });

    res.json({ success: true, data: result.hits, meta: { total: result.total } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// GET /search/people
searchRouter.get('/people', async (req: any, res: Response) => {
  try {
    const { q } = req.query;
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.user.tenantId,
        isDeactivated: false,
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { email: { contains: q as string, mode: 'insensitive' } },
          { department: { contains: q as string, mode: 'insensitive' } },
          { jobTitle: { contains: q as string, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: { id: true, name: true, email: true, avatarUrl: true, department: true, jobTitle: true, status: true },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'People search failed' });
  }
});

// GET /search/channels
searchRouter.get('/channels', async (req: any, res: Response) => {
  try {
    const { q } = req.query;
    const channels = await prisma.channel.findMany({
      where: {
        tenantId: req.user.tenantId,
        isArchived: false,
        type: { in: ['PUBLIC', 'ANNOUNCEMENT'] },
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { description: { contains: q as string, mode: 'insensitive' } },
        ],
      },
      take: 20,
      include: { _count: { select: { members: true } } },
    });
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Channel search failed' });
  }
});

// POST /search/index/message — internal: index a message (called by chat-service)
searchRouter.post('/index/message', async (req: Request, res: Response) => {
  try {
    const { id, channelId, tenantId, senderId, senderName, content, type, createdAt, hasAttachments, hasLinks } = req.body;
    await elasticsearchService.indexMessage({ id, channelId, tenantId, senderId, senderName, content, type, createdAt: new Date(createdAt), hasAttachments, hasLinks });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Indexing failed' });
  }
});

// POST /search/index/file — internal: index a file
searchRouter.post('/index/file', async (req: Request, res: Response) => {
  try {
    const { id, channelId, tenantId, uploaderId, fileName, mimeType, ocrText, fileSize, createdAt } = req.body;
    await elasticsearchService.indexFile({ id, channelId, tenantId, uploaderId, fileName, mimeType, ocrText, fileSize, createdAt: new Date(createdAt) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'File indexing failed' });
  }
});
