import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { slashCommandsRouter } from './routes/slash-commands.routes';
import { webhooksRouter } from './routes/webhooks.routes';
import { botsRouter } from './routes/bots.routes';
import { startReminderWorker } from './jobs/reminder.worker';

const logger = createLogger('bot-service');
const app = express();
const PORT = process.env.BOT_SERVICE_PORT || 3009;

// ─── Redis ────────────────────────────────────────────────────────────────────
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/slash-commands', slashCommandsRouter);
app.use('/webhooks', webhooksRouter);
app.use('/bots', botsRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'healthy', service: 'bot-service', timestamp: new Date() });
  } catch (err) {
    logger.error('Health check failed', { err });
    res.status(503).json({ status: 'unhealthy', service: 'bot-service' });
  }
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await prisma.$connect();
  await redis.connect();
  logger.info('Database and Redis connected');

  startReminderWorker(redis);
  logger.info('Reminder worker started');

  app.listen(PORT, () => {
    logger.info(`Bot service running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start bot service', { err });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
