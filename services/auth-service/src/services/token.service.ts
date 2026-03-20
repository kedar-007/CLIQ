import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { redis } from '../config/redis';
import { prisma } from '@comms/db';
import type { JWTPayload } from '@comms/types';

const REFRESH_EXPIRES_DAYS = 30;

// Read env vars lazily (at call time, not module-load time) to avoid dotenv hoisting issue
const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || 'fallback-access-secret';
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const getAccessExpires = () => process.env.JWT_ACCESS_EXPIRES_IN || '15m';

export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: getAccessExpires() } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, getAccessSecret()) as JWTPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, getRefreshSecret()) as { sub: string };
}

export async function generateRefreshToken(
  userId: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<string> {
  const raw = randomBytes(64).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

  await prisma.refreshToken.create({
    data: { userId, token: tokenHash, deviceInfo, ipAddress, expiresAt },
  });

  // Store in Redis for fast lookup
  await redis.setex(
    `refresh_token:${tokenHash}`,
    REFRESH_EXPIRES_DAYS * 86400,
    userId
  );

  return raw;
}

export async function rotateRefreshToken(
  oldRaw: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const oldHash = createHash('sha256').update(oldRaw).digest('hex');

  const existing = await prisma.refreshToken.findUnique({
    where: { token: oldHash },
    include: { user: { include: { tenant: true } } },
  });

  if (!existing || existing.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }

  if (existing.user.isDeactivated) {
    throw new Error('User is deactivated');
  }

  // Delete old token
  await prisma.refreshToken.delete({ where: { id: existing.id } });
  await redis.del(`refresh_token:${oldHash}`);

  const accessToken = generateAccessToken({
    sub: existing.userId,
    tenantId: existing.user.tenantId,
    role: existing.user.role as any,
    email: existing.user.email,
  });

  const refreshToken = await generateRefreshToken(existing.userId, deviceInfo, ipAddress);

  return { accessToken, refreshToken, userId: existing.userId };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = createHash('sha256').update(raw).digest('hex');
  await prisma.refreshToken.deleteMany({ where: { token: hash } });
  await redis.del(`refresh_token:${hash}`);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const tokens = await prisma.refreshToken.findMany({ where: { userId } });
  for (const t of tokens) {
    await redis.del(`refresh_token:${t.token}`);
  }
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export function generateEmailVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('hex');
}

export async function storePasswordResetToken(userId: string, token: string): Promise<void> {
  await redis.setex(`pwd_reset:${token}`, 3600, userId); // 1 hour
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const userId = await redis.get(`pwd_reset:${token}`);
  if (userId) await redis.del(`pwd_reset:${token}`);
  return userId;
}
