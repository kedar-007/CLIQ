import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { containsCreditCardPattern, containsSSNPattern } from '@comms/utils';
import { Queue } from 'bullmq';
import jwt from 'jsonwebtoken';
import type { Notification, JWTPayload } from '@comms/types';

const logger = createLogger('chat-service:chat');

interface AuthSocket extends Socket {
  user?: JWTPayload;
}

let notificationQueue: Queue;

async function createInAppNotification(params: {
  io: Server;
  userId: string;
  tenantId: string;
  type: Notification['type'];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  messageId?: string;
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      tenantId: params.tenantId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data || {},
      channelId: params.channelId,
      messageId: params.messageId,
    },
  });

  io.to(`user:${params.userId}`).emit('notification:new', notification as Notification);
}

export function registerChatHandlers(io: Server, redis: Redis): void {
  notificationQueue = new Queue('notifications', { connection: redis });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.user?.sub;
    if (!userId) return;

    // ─── Message: Send ──────────────────────────────────────────────────────────
    socket.on('message:send', async (data) => {
      try {
        const { channelId, content, contentRaw, parentId, attachmentIds, scheduledAt } = data;

        // DLP check
        if (content && (containsCreditCardPattern(content) || containsSSNPattern(content))) {
          socket.emit('message:error', { error: 'Message blocked by DLP policy' });
          return;
        }

        // Verify membership — auto-join PUBLIC channels
        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        let member = await prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId, userId } },
        });
        if (!member) {
          if (channel?.type === 'PUBLIC') {
            member = await prisma.channelMember.create({ data: { channelId, userId, role: 'MEMBER' } });
            socket.join(`channel:${channelId}`);
          } else {
            socket.emit('message:error', { error: 'Not a member of this channel' });
            return;
          }
        }

        // Check read-only
        if (channel?.isReadOnly && !['OWNER', 'MODERATOR', 'ADMIN'].includes(socket.user?.role || '')) {
          socket.emit('message:error', { error: 'Channel is read-only' });
          return;
        }

        if (scheduledAt) {
          // Store as scheduled message
          const msg = await prisma.message.create({
            data: { channelId, senderId: userId, content, contentRaw, parentId, scheduledAt: new Date(scheduledAt) },
          });
          // Schedule via BullMQ
          const msgQueue = new Queue('scheduled-messages', { connection: redis });
          const delay = new Date(scheduledAt).getTime() - Date.now();
          if (delay > 0) {
            await msgQueue.add('deliver', { messageId: msg.id }, { delay });
          }
          socket.emit('message:scheduled', { messageId: msg.id, scheduledAt });
          return;
        }

        const message = await prisma.message.create({
          data: { channelId, senderId: userId, content, contentRaw, parentId, deliveredAt: new Date() },
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true, role: true } },
            attachments: true,
          },
        });

        // Update thread if it's a reply
        if (parentId) {
          await prisma.thread.upsert({
            where: { parentMessageId: parentId },
            create: {
              channelId,
              parentMessageId: parentId,
              participantIds: [userId],
              replyCount: 1,
              lastActivityAt: new Date(),
            },
            update: {
              replyCount: { increment: 1 },
              lastActivityAt: new Date(),
            },
          });
        }

        // Broadcast to channel room first.
        io.to(`channel:${channelId}`).emit('message:new', message);

        try {
          if (channel?.type === 'DM' || channel?.type === 'GROUP_DM') {
            const recipients = await prisma.channelMember.findMany({
              where: {
                channelId,
                userId: { not: userId },
              },
              include: {
                user: { select: { id: true, name: true } },
              },
            });

            for (const recipient of recipients) {
              await createInAppNotification({
                io,
                userId: recipient.userId,
                tenantId: socket.user?.tenantId || '',
                type: 'MESSAGE_REPLY',
                title: `New message from ${message.sender?.name || 'A teammate'}`,
                body: content?.slice(0, 160) || 'You have a new direct message.',
                data: { channelId, messageId: message.id },
                channelId,
                messageId: message.id,
              });
            }
          } else if (channel) {
            const recipients = await prisma.channelMember.findMany({
              where: {
                channelId,
                userId: { not: userId },
              },
              select: { userId: true },
            });

            for (const recipient of recipients) {
              await createInAppNotification({
                io,
                userId: recipient.userId,
                tenantId: socket.user?.tenantId || '',
                type: 'MESSAGE_REPLY',
                title: `${message.sender?.name || 'A teammate'} posted in #${channel.name}`,
                body: content?.slice(0, 160) || 'You have a new channel message.',
                data: { channelId, messageId: message.id },
                channelId,
                messageId: message.id,
              });
            }
          }

          if (parentId) {
            const parent = await prisma.message.findUnique({
              where: { id: parentId },
              include: {
                sender: { select: { id: true, name: true } },
              },
            });

            if (parent?.senderId && parent.senderId !== userId) {
              await createInAppNotification({
                io,
                userId: parent.senderId,
                tenantId: socket.user?.tenantId || '',
                type: 'MESSAGE_REPLY',
                title: `${message.sender?.name || 'A teammate'} replied in a thread`,
                body: content?.slice(0, 160) || 'You have a new thread reply.',
                data: { channelId, messageId: message.id, parentId },
                channelId,
                messageId: message.id,
              });
            }
          }

          // Parse mentions and send notifications
          const mentions = parseMentions(content || '');
          for (const mention of mentions) {
            const mentionedUser = await prisma.user.findFirst({
              where: { name: { contains: mention, mode: 'insensitive' }, tenantId: socket.user?.tenantId },
            });
            if (mentionedUser) {
              await createInAppNotification({
                io,
                userId: mentionedUser.id,
                tenantId: socket.user?.tenantId || '',
                type: 'MESSAGE_MENTION',
                title: `${message.sender?.name} mentioned you`,
                body: content?.slice(0, 100) || '',
                data: { channelId, messageId: message.id },
                channelId,
                messageId: message.id,
              });

              await notificationQueue.add('mention', {
                userId: mentionedUser.id,
                tenantId: socket.user?.tenantId,
                type: 'MESSAGE_MENTION',
                title: `${message.sender?.name} mentioned you`,
                body: content?.slice(0, 100),
                data: { channelId, messageId: message.id },
                channels: ['push', 'email'],
              });
            }
          }
        } catch (sideEffectError) {
          logger.warn('message:send side effects failed', { err: sideEffectError, messageId: message.id, userId });
        }

      } catch (err) {
        logger.error('message:send error', { err, userId });
        socket.emit('message:error', { error: 'Failed to send message' });
      }
    });

    // ─── Message: Edit ──────────────────────────────────────────────────────────
    socket.on('message:edit', async (data) => {
      try {
        const { messageId, content, contentRaw } = data;

        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message || message.senderId !== userId) {
          socket.emit('message:error', { error: 'Cannot edit this message' });
          return;
        }

        // Store version history
        await prisma.messageVersion.create({
          data: { messageId, content: message.content || '', editedAt: new Date() },
        });

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content, contentRaw, isEdited: true, editedAt: new Date() },
          include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
        });

        io.to(`channel:${message.channelId}`).emit('message:updated', updated);
      } catch (err) {
        logger.error('message:edit error', { err });
        socket.emit('message:error', { error: 'Failed to edit message' });
      }
    });

    // ─── Message: Delete ────────────────────────────────────────────────────────
    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;
        const message = await prisma.message.findUnique({ where: { id: messageId } });

        if (!message) { socket.emit('message:error', { error: 'Message not found' }); return; }

        const isOwner = message.senderId === userId;
        const isAdmin = ['OWNER', 'ADMIN', 'MODERATOR'].includes(socket.user?.role || '');
        if (!isOwner && !isAdmin) {
          socket.emit('message:error', { error: 'Cannot delete this message' }); return;
        }

        await prisma.message.update({
          where: { id: messageId },
          data: { deletedAt: new Date(), content: null, contentRaw: null },
        });

        io.to(`channel:${message.channelId}`).emit('message:deleted', {
          messageId,
          channelId: message.channelId,
        });
      } catch (err) {
        logger.error('message:delete error', { err });
      }
    });

    // ─── Reaction ───────────────────────────────────────────────────────────────
    socket.on('message:react', async (data) => {
      try {
        const { messageId, emoji, action } = data;
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message) return;

        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId, emoji } },
        });

        const shouldAdd = action === 'add' || (!action && !existing);
        if (shouldAdd) {
          await prisma.messageReaction.upsert({
            where: { messageId_userId_emoji: { messageId, userId, emoji } },
            create: { messageId, userId, emoji },
            update: {},
          });
        } else {
          await prisma.messageReaction.deleteMany({ where: { messageId, userId, emoji } });
        }

        const reactions = await prisma.messageReaction.findMany({ where: { messageId } });
        const reactionMap = new Map<string, string[]>();
        for (const r of reactions) {
          if (!reactionMap.has(r.emoji)) reactionMap.set(r.emoji, []);
          reactionMap.get(r.emoji)!.push(r.userId);
        }
        const aggregated = [...reactionMap.entries()].map(([e, users]) => ({
          emoji: e, count: users.length, users, hasReacted: users.includes(userId),
        }));

        io.to(`channel:${message.channelId}`).emit('message:reaction', {
          messageId, channelId: message.channelId, reactions: aggregated,
        });
      } catch (err) {
        logger.error('message:react error', { err });
      }
    });

    // ─── Typing Indicators ──────────────────────────────────────────────────────
    const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    socket.on('typing:start', async (data) => {
      const { channelId } = data;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      });

      socket.to(`channel:${channelId}`).emit('typing:user', {
        channelId,
        userId,
        user,
        isTyping: true,
      });

      // Auto-clear after 5 seconds
      const existing = typingTimeouts.get(channelId);
      if (existing) clearTimeout(existing);
      typingTimeouts.set(channelId, setTimeout(() => {
        socket.to(`channel:${channelId}`).emit('typing:user', { channelId, userId, user, isTyping: false });
        typingTimeouts.delete(channelId);
      }, 5000));
    });

    socket.on('typing:stop', (data) => {
      const { channelId } = data;
      const existing = typingTimeouts.get(channelId);
      if (existing) { clearTimeout(existing); typingTimeouts.delete(channelId); }
      socket.to(`channel:${channelId}`).emit('typing:user', { channelId, userId, isTyping: false });
    });

    // ─── Read Receipt ───────────────────────────────────────────────────────────
    socket.on('read:mark', async (data) => {
      try {
        const { channelId, messageId } = data;
        await prisma.channelMember.update({
          where: { channelId_userId: { channelId, userId } },
          data: { lastReadAt: new Date() },
        });
        if (messageId) {
          await prisma.messageRead.upsert({
            where: { messageId_userId: { messageId, userId } },
            create: { messageId, userId },
            update: { readAt: new Date() },
          });
        }
      } catch (err) {
        logger.error('read:mark error', { err });
      }
    });

    // ─── Presence Update ────────────────────────────────────────────────────────
    socket.on('presence:update', async (data) => {
      const { status, customStatusEmoji, customStatusText } = data;
      await prisma.user.update({
        where: { id: userId },
        data: { status, customStatusEmoji, customStatusText },
      }).catch(() => {});
      io.to(`tenant:${socket.user?.tenantId}`).emit('presence:update', {
        userId,
        tenantId: socket.user?.tenantId,
        status,
        customStatusEmoji,
        customStatusText,
      });
    });

    // ─── Channel Join/Leave ──────────────────────────────────────────────────────
    socket.on('channel:join', async (data) => {
      const { channelId } = data;
      try {
        await prisma.channelMember.upsert({
          where: { channelId_userId: { channelId, userId } },
          create: { channelId, userId, role: 'MEMBER' },
          update: {},
        });
        socket.join(`channel:${channelId}`);
        io.to(`channel:${channelId}`).emit('member:joined', { channelId, userId });
      } catch (err) {
        logger.error('channel:join error', { err });
      }
    });

    socket.on('channel:leave', async (data) => {
      const { channelId } = data;
      await prisma.channelMember.delete({
        where: { channelId_userId: { channelId, userId } },
      }).catch(() => {});
      socket.leave(`channel:${channelId}`);
      io.to(`channel:${channelId}`).emit('member:left', { channelId, userId });
    });

    // ─── Poll Vote ──────────────────────────────────────────────────────────────
    socket.on('poll:vote', async (data) => {
      try {
        const { pollId, selectedOptions } = data;
        await prisma.pollVote.upsert({
          where: { pollId_userId: { pollId, userId } },
          create: { pollId, userId, selectedOptions },
          update: { selectedOptions },
        });

        // Count votes per option
        const votes = await prisma.pollVote.findMany({ where: { pollId } });
        const tally: Record<string, number> = {};
        for (const v of votes) {
          for (const opt of v.selectedOptions) {
            tally[opt] = (tally[opt] || 0) + 1;
          }
        }

        const poll = await prisma.poll.findUnique({ where: { id: pollId } });
        if (poll) {
          io.to(`channel:${poll.channelId}`).emit('poll:updated', { pollId, votes: tally });
        }
      } catch (err) {
        logger.error('poll:vote error', { err });
      }
    });
  });
}

function parseMentions(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_\s-]+)/g;
  const matches = content.matchAll(mentionRegex);
  return [...matches].map((m) => m[1].trim());
}
