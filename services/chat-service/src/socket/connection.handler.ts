import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('chat-service:connection');

interface AuthSocket extends Socket {
  user?: JWTPayload;
  tenantId?: string;
}

export function registerConnectionHandler(io: Server, redis: Redis): void {
  // JWT authentication middleware
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token as string, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
      socket.user = payload;
      socket.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error('Invalid access token'));
    }
  });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.user!.sub;
    const tenantId = socket.user!.tenantId;

    logger.info('Client connected', { userId, socketId: socket.id });

    // Join user's personal room (for direct notifications)
    socket.join(`user:${userId}`);

    // Join tenant room (for workspace-wide broadcasts)
    socket.join(`tenant:${tenantId}`);

    // Auto-join user's channels
    try {
      // Ensure user is member of default PUBLIC channels
      const defaultChannels = await prisma.channel.findMany({
        where: { tenantId, isDefault: true, type: 'PUBLIC', isArchived: false },
        select: { id: true },
      });
      for (const ch of defaultChannels) {
        await prisma.channelMember.upsert({
          where: { channelId_userId: { channelId: ch.id, userId } },
          create: { channelId: ch.id, userId, role: 'MEMBER' },
          update: {},
        }).catch(() => {});
      }

      const memberships = await prisma.channelMember.findMany({
        where: { userId },
        select: { channelId: true },
      });

      for (const m of memberships) {
        socket.join(`channel:${m.channelId}`);
      }

      // Update presence to ONLINE
      await updatePresence(redis, userId, tenantId, 'ONLINE');
      io.to(`tenant:${tenantId}`).emit('presence:update', {
        userId,
        tenantId,
        status: 'ONLINE',
        lastSeen: new Date(),
      });

      // Start heartbeat
      const heartbeat = setInterval(async () => {
        await redis.setex(`presence:${userId}`, 90, 'ONLINE');
      }, 60000);

      socket.on('disconnect', async () => {
        clearInterval(heartbeat);
        logger.info('Client disconnected', { userId, socketId: socket.id });

        // Update presence to OFFLINE
        await updatePresence(redis, userId, tenantId, 'OFFLINE');
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'OFFLINE', lastSeen: new Date() },
        }).catch(() => {});

        io.to(`tenant:${tenantId}`).emit('presence:update', {
          userId,
          tenantId,
          status: 'OFFLINE',
          lastSeen: new Date(),
        });
      });

    } catch (err) {
      logger.error('Connection setup error', { err, userId });
    }
  });
}

async function updatePresence(
  redis: Redis,
  userId: string,
  tenantId: string,
  status: string
): Promise<void> {
  await redis.setex(`presence:${userId}`, 90, status);
  await prisma.user.update({
    where: { id: userId },
    data: { status: status as any, lastSeen: new Date() },
  }).catch(() => {});
}
