import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { callsRouter } from './routes/calls.routes';

const logger = createLogger('call-service');
const app = express();
const PORT = process.env.CALL_SERVICE_PORT || 3003;

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/calls', callsRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', service: 'call-service' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

async function bootstrap() {
  await prisma.$connect();
  app.listen(PORT, () => logger.info(`Call service running on port ${PORT}`));
}

bootstrap().catch((err) => { logger.error('Startup failed', { err }); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
