import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { searchRouter } from './routes/search.routes';
import { elasticsearchService } from './services/elasticsearch.service';

const logger = createLogger('search-service');
const app = express();
const PORT = process.env.SEARCH_SERVICE_PORT || 3006;

app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/search', searchRouter);

app.get('/health', async (_req, res) => {
  try {
    await elasticsearchService.client.ping();
    res.json({ status: 'healthy', service: 'search-service' });
  } catch {
    res.status(503).json({ status: 'unhealthy', error: 'Elasticsearch unreachable' });
  }
});

async function bootstrap() {
  await prisma.$connect();
  await elasticsearchService.createIndices();
  app.listen(PORT, () => logger.info(`Search service running on port ${PORT}`));
}

bootstrap().catch((err) => { logger.error('Startup failed', { err }); process.exit(1); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
