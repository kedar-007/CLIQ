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
const HOST = process.env.CHAT_SERVICE_HOST || '0.0.0.0';

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

// ─── Redis ────────────────────────────────────────────────────────────────────
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();

// ─── Socket.IO ────────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.adapter(createAdapter(pubClient, subClient));

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
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

  httpServer.listen(Number(PORT), HOST, () => {
    logger.info(`Chat service running on ${HOST}:${PORT}`);
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
