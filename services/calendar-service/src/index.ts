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
import { authMiddleware } from './middleware/auth.middleware';
import { eventsRouter } from './routes/events.routes';
import { meetingRoomsRouter } from './routes/meeting-rooms.routes';
import { syncRouter } from './routes/sync.routes';
import { startEventReminderWorker } from './jobs/reminder.worker';

const logger = createLogger('calendar-service');
const app = express();
const PORT = process.env.CALENDAR_SERVICE_PORT || 3007;

// ─── Redis ────────────────────────────────────────────────────────────────────
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => logger.error('Redis connection error', { err }));

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'healthy', service: 'calendar-service', timestamp: new Date() });
  } catch (err) {
    logger.error('Health check failed', { err });
    res.status(503).json({ status: 'unhealthy', service: 'calendar-service' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/events', authMiddleware, eventsRouter);
app.use('/api/v1/rooms', authMiddleware, meetingRoomsRouter);
app.use('/api/v1/sync', authMiddleware, syncRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error('Unhandled error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await prisma.$connect();
  await redis.connect();
  logger.info('Database and Redis connected');

  startEventReminderWorker(redis);
  logger.info('Event reminder worker started');

  app.listen(PORT, () => {
    logger.info(`Calendar service running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start calendar service', { err });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
