import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { notificationsRouter } from './routes/notifications.routes';
import { startWorkers } from './jobs/workers';

const logger = createLogger('notification-service');
const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3004;

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/notifications', notificationsRouter);

app.get('/health', async (_req, res) => {
  res.json({ status: 'healthy', service: 'notification-service' });
});

async function bootstrap() {
  await prisma.$connect();
  startWorkers(redis);
  app.listen(PORT, () => logger.info(`Notification service running on port ${PORT}`));
}

bootstrap().catch((err) => { console.error('Startup failed:', err?.message, err?.stack); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
