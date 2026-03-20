import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { billingRouter } from './routes/billing.routes';

const logger = createLogger('billing-service');
const app = express();
const PORT = process.env.BILLING_SERVICE_PORT || 3013;

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));

// Raw body needed for Stripe webhooks
app.use('/billing/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/billing', billingRouter);

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'billing-service' }));

async function bootstrap() {
  await prisma.$connect();
  app.listen(PORT, () => logger.info(`Billing service running on port ${PORT}`));
}

bootstrap().catch((err) => { logger.error('Startup failed', { err }); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
