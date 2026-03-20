import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { messagesRouter } from './routes/messages.routes';
import { channelsRouter } from './routes/channels.routes';
import { dmRouter } from './routes/dm.routes';
import { registerChatHandlers } from './socket/chat.handler';
import { registerConnectionHandler } from './socket/connection.handler';

const logger = createLogger('chat-service');
const app = express();
const httpServer = createServer(app);
const PORT = process.env.CHAT_SERVICE_PORT || 3002;

// ─── Redis ────────────────────────────────────────────────────────────────────
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();

// ─── Socket.IO ────────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.adapter(createAdapter(pubClient, subClient));

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.NEXTAUTH_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/messages', messagesRouter);
app.use('/channels', channelsRouter);
app.use('/dm', dmRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', service: 'chat-service', connections: io.engine.clientsCount });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// ─── Socket Registration ──────────────────────────────────────────────────────
registerConnectionHandler(io, redis);
registerChatHandlers(io, redis);

// ─── Start ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  await prisma.$connect();
  logger.info('Database connected');

  httpServer.listen(PORT, () => {
    logger.info(`Chat service running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start chat service', { err });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});
