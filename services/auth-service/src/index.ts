import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createLogger } from '@comms/logger';
import { prisma } from '@comms/db';
import { Redis } from 'ioredis';
import { authRouter } from './routes/auth.routes';
import { oauthRouter } from './routes/oauth.routes';
import { samlRouter } from './routes/saml.routes';
import { scimRouter } from './routes/scim.routes';
import './config/passport';

const logger = createLogger('auth-service');
const app = express();
const PORT = process.env.AUTH_SERVICE_PORT || 3001;
const HOST = process.env.AUTH_SERVICE_HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const globalRateLimitMax = Number(process.env.AUTH_GLOBAL_RATE_LIMIT_MAX || (isProduction ? 100 : 1000));
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX || (isProduction ? 20 : 200));

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
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: globalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authRateLimitMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRouter);
app.use('/oauth', oauthRouter);
app.use('/saml', samlRouter);
app.use('/scim', scimRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: String(err) });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await redis.connect();
    logger.info('Redis connected');
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(Number(PORT), HOST, () => {
      logger.info(`Auth service running on ${HOST}:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start auth service', { error: err });
    process.exit(1);
  }
}

bootstrap();

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});
