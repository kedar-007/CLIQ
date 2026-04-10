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
const HOST = process.env.NOTIFICATION_SERVICE_HOST || '0.0.0.0';

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;

  const explicitOrigins = [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean) as string[];

  if (explicitOrigins.includes(origin)) return true;

  try {
    const { hostname, port, protocol } = new URL(origin);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    const isLan =
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    const isLanDomain = hostname.endsWith('.sslip.io') || hostname.endsWith('.nip.io');
    return (port === '3000' && (isLocal || isLan)) || (protocol === 'https:' && (!port || port === '443') && (isLocal || isLan || isLanDomain));
  } catch {
    return false;
  }
}

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(express.json());

app.use('/notifications', notificationsRouter);

app.get('/health', async (_req, res) => {
  res.json({ status: 'healthy', service: 'notification-service' });
});

async function bootstrap() {
  await prisma.$connect();
  startWorkers(redis);
  app.listen(Number(PORT), HOST, () => logger.info(`Notification service running on ${HOST}:${PORT}`));
}

bootstrap().catch((err) => { console.error('Startup failed:', err?.message, err?.stack); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
