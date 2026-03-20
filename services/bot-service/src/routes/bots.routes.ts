import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('bot-service:bots');
export const botsRouter = Router();

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

botsRouter.use(auth);

// ─── Built-in bot catalog ─────────────────────────────────────────────────────
const BOT_CATALOG = [
  {
    id: 'poll-bot',
    name: 'PollBot',
    description: 'Create interactive polls in channels',
    category: 'productivity',
    iconUrl: '/bots/poll-bot.png',
    commands: ['/poll'],
  },
  {
    id: 'reminder-bot',
    name: 'ReminderBot',
    description: 'Schedule reminders for yourself and others',
    category: 'productivity',
    iconUrl: '/bots/reminder-bot.png',
    commands: ['/remind'],
  },
  {
    id: 'standup-bot',
    name: 'StandupBot',
    description: 'Automate daily standup meetings',
    category: 'productivity',
    iconUrl: '/bots/standup-bot.png',
    commands: ['/standup'],
  },
  {
    id: 'giphy-bot',
    name: 'GiphyBot',
    description: 'Search and post GIFs',
    category: 'fun',
    iconUrl: '/bots/giphy-bot.png',
    commands: ['/giphy'],
  },
  {
    id: 'wiki-bot',
    name: 'WikiBot',
    description: 'Search Wikipedia and post summaries',
    category: 'knowledge',
    iconUrl: '/bots/wiki-bot.png',
    commands: ['/wiki'],
  },
];

// GET /bots — list available bots with install status
botsRouter.get('/', async (req: any, res: Response) => {
  try {
    const installations = await (prisma as any).botInstallation.findMany({
      where: { tenantId: req.user.tenantId, deletedAt: null },
      select: { botId: true, isActive: true },
    });

    const installedMap = new Map(installations.map((i: any) => [i.botId, i.isActive]));

    const botsWithStatus = BOT_CATALOG.map((bot) => ({
      ...bot,
      isInstalled: installedMap.has(bot.id),
      isActive: installedMap.get(bot.id) ?? false,
    }));

    res.json({ success: true, data: botsWithStatus });
  } catch (err) {
    logger.error('List bots error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /bots/:botId/install
botsRouter.post('/:botId/install', async (req: any, res: Response) => {
  try {
    const { botId } = req.params;
    const catalogBot = BOT_CATALOG.find((b) => b.id === botId);

    if (!catalogBot) {
      res.status(404).json({ success: false, error: 'Bot not found' });
      return;
    }

    const existing = await (prisma as any).botInstallation.findFirst({
      where: { botId, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (existing) {
      // Re-activate if disabled
      const updated = await (prisma as any).botInstallation.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      res.json({ success: true, data: updated, message: 'Bot re-activated' });
      return;
    }

    const installation = await (prisma as any).botInstallation.create({
      data: {
        botId,
        tenantId: req.user.tenantId,
        installedBy: req.user.sub,
        isActive: true,
        config: {},
      },
    });

    res.status(201).json({ success: true, data: installation });
  } catch (err) {
    logger.error('Install bot error', { err, botId: req.params.botId });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// DELETE /bots/:botId/uninstall
botsRouter.delete('/:botId/uninstall', async (req: any, res: Response) => {
  try {
    const { botId } = req.params;

    const existing = await (prisma as any).botInstallation.findFirst({
      where: { botId, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Bot not installed' });
      return;
    }

    await (prisma as any).botInstallation.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    res.json({ success: true, message: 'Bot uninstalled' });
  } catch (err) {
    logger.error('Uninstall bot error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /bots/:botId/config
botsRouter.get('/:botId/config', async (req: any, res: Response) => {
  try {
    const { botId } = req.params;

    const installation = await (prisma as any).botInstallation.findFirst({
      where: { botId, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!installation) {
      res.status(404).json({ success: false, error: 'Bot not installed' });
      return;
    }

    res.json({ success: true, data: { botId, config: installation.config } });
  } catch (err) {
    logger.error('Get bot config error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

const botConfigSchema = z.object({
  config: z.record(z.unknown()),
});

// POST /bots/:botId/config
botsRouter.post('/:botId/config', async (req: any, res: Response) => {
  try {
    const { botId } = req.params;
    const parsed = botConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const installation = await (prisma as any).botInstallation.findFirst({
      where: { botId, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!installation) {
      res.status(404).json({ success: false, error: 'Bot not installed' });
      return;
    }

    const updated = await (prisma as any).botInstallation.update({
      where: { id: installation.id },
      data: { config: parsed.data.config, updatedAt: new Date() },
    });

    res.json({ success: true, data: { botId, config: updated.config } });
  } catch (err) {
    logger.error('Update bot config error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});
