import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@comms/logger';

const logger = createLogger('bot-service:reminder-service');

export const REMINDER_QUEUE = 'reminders';

let reminderQueue: Queue | null = null;

export function getReminderQueue(redis: Redis): Queue {
  if (!reminderQueue) {
    reminderQueue = new Queue(REMINDER_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return reminderQueue;
}

export interface ReminderJobData {
  userId: string;
  channelId: string;
  message: string;
  tenantId: string;
  scheduledAt: string;
  createdBy: string;
}

/**
 * Schedule a reminder as a BullMQ delayed job.
 * @param userId      recipient user ID
 * @param channelId   target channel ID (can be a DM channel)
 * @param message     reminder text
 * @param delayMs     milliseconds until the reminder fires
 * @param tenantId    tenant context
 * @param createdBy   user who set the reminder
 */
export async function scheduleReminder(
  userId: string,
  channelId: string,
  message: string,
  delayMs: number,
  tenantId: string,
  createdBy: string,
  redis: Redis
): Promise<string> {
  const queue = getReminderQueue(redis);
  const scheduledAt = new Date(Date.now() + delayMs).toISOString();

  const jobData: ReminderJobData = {
    userId,
    channelId,
    message,
    tenantId,
    scheduledAt,
    createdBy,
  };

  const job = await queue.add('send-reminder', jobData, { delay: delayMs });
  logger.info('Reminder scheduled', { jobId: job.id, userId, delayMs, scheduledAt });
  return job.id!;
}

/**
 * Parse delay strings like "30m", "2h", "1d", "45s" into milliseconds.
 */
export function parseDelay(delayStr: string): number | null {
  const match = delayStr.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

/**
 * Parse reminder args like "@user message in 30m" or "message in 2h".
 * Returns { targetUser, message, delayMs } or null if invalid.
 */
export function parseReminderArgs(args: string): {
  targetUser: string | null;
  message: string;
  delayMs: number;
} | null {
  // Match: [@user] <message> in <delay>
  const pattern = /^(?:(@\S+)\s+)?(.+?)\s+in\s+(\d+[smhd])$/i;
  const match = args.trim().match(pattern);
  if (!match) return null;

  const targetUser = match[1] ? match[1].replace('@', '') : null;
  const message = match[2].trim();
  const delayMs = parseDelay(match[3]);

  if (delayMs === null) return null;

  return { targetUser, message, delayMs };
}
