import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import axios from 'axios';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('bot-service:webhooks');
export const webhooksRouter = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// ─── Incoming webhook — no auth needed, validated by token in URL ─────────────
// POST /webhooks/incoming/:token
webhooksRouter.post('/incoming/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ success: false, error: 'Missing token' });
      return;
    }

    // Look up webhook config by token
    const webhookConfig = await (prisma as any).incomingWebhook.findFirst({
      where: { token, isActive: true },
    });

    if (!webhookConfig) {
      res.status(401).json({ success: false, error: 'Invalid webhook token' });
      return;
    }

    const { text, username, iconUrl, attachments } = req.body;
    if (!text && !attachments) {
      res.status(400).json({ success: false, error: 'text or attachments required' });
      return;
    }

    // Post message to target channel via chat-service
    const chatServiceUrl = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
    await axios.post(
      `${chatServiceUrl}/messages`,
      {
        channelId: webhookConfig.channelId,
        content: text || '',
        botName: username || webhookConfig.name,
        botIconUrl: iconUrl || webhookConfig.iconUrl,
        attachments: attachments || [],
        tenantId: webhookConfig.tenantId,
        isBot: true,
      },
      { headers: { 'x-service-secret': process.env.SERVICE_SECRET || 'internal' } }
    );

    await (prisma as any).incomingWebhook.update({
      where: { id: webhookConfig.id },
      data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Incoming webhook error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// All routes below require auth
webhooksRouter.use(auth);

// GET /webhooks/outgoing — list outgoing webhook configs
webhooksRouter.get('/outgoing', async (req: any, res: Response) => {
  try {
    const configs = await (prisma as any).outgoingWebhook.findMany({
      where: { tenantId: req.user.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: configs });
  } catch (err) {
    logger.error('List outgoing webhooks error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

const outgoingWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  channelId: z.string().optional(),
  triggerWords: z.array(z.string()).default([]),
  triggerOnAllMessages: z.boolean().default(false),
  secret: z.string().optional(),
  isActive: z.boolean().default(true),
});

// POST /webhooks/outgoing — create outgoing webhook
webhooksRouter.post('/outgoing', async (req: any, res: Response) => {
  try {
    const parsed = outgoingWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const config = await (prisma as any).outgoingWebhook.create({
      data: {
        ...parsed.data,
        tenantId: req.user.tenantId,
        createdBy: req.user.sub,
      },
    });

    res.status(201).json({ success: true, data: config });
  } catch (err) {
    logger.error('Create outgoing webhook error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// DELETE /webhooks/outgoing/:id
webhooksRouter.delete('/outgoing/:id', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await (prisma as any).outgoingWebhook.findFirst({
      where: { id, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Webhook not found' });
      return;
    }

    await (prisma as any).outgoingWebhook.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Delete outgoing webhook error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});
