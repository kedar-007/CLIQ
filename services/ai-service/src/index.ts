import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { aiRouter } from './routes/ai.routes';

const logger = createLogger('ai-service');
const app = express();
const PORT = process.env.AI_SERVICE_PORT || 3011;

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use('/ai', aiRouter);

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'ai-service' }));

async function bootstrap() {
  await prisma.$connect();
  app.listen(PORT, () => logger.info(`AI service running on port ${PORT}`));
}

bootstrap().catch((err) => { logger.error('Startup failed', { err }); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
