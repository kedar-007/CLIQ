import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { analyticsRouter } from './routes/analytics.routes';

const logger = createLogger('analytics-service');
const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 3012;

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/analytics', analyticsRouter);
app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'analytics-service' }));

async function bootstrap() {
  await prisma.$connect();
  app.listen(PORT, () => logger.info(`Analytics service running on port ${PORT}`));
}
bootstrap().catch((err) => { logger.error('Startup failed', { err }); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
