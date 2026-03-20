import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';
import { executeSlashCommand } from '../services/bot-engine';

const logger = createLogger('bot-service:slash-commands');
export const slashCommandsRouter = Router();

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

slashCommandsRouter.use(auth);

// ─── Schema ───────────────────────────────────────────────────────────────────
const executeSchema = z.object({
  command: z.string().min(1),   // e.g. "poll", "remind", "standup", "task", "giphy", "time", "wiki", "help"
  args: z.string().default(''), // rest of the text after /command
  channelId: z.string().min(1),
  workspaceId: z.string().optional(),
});

// POST /slash-commands/execute
slashCommandsRouter.post('/execute', async (req: any, res: Response) => {
  try {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const { command, args, channelId } = parsed.data;
    const context = {
      userId: req.user.sub,
      tenantId: req.user.tenantId,
      channelId,
    };

    const result = await executeSlashCommand(command, args, context);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Slash command execution failed', { err, body: req.body });
    res.status(500).json({ success: false, error: 'Command execution failed' });
  }
});
