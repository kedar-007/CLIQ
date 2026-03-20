import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@comms/logger';
import { prisma } from '@comms/db';
import axios from 'axios';

const logger = createLogger('calendar-reminder-worker');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';
const QUEUE_NAME = 'event-reminders';

export interface ReminderJob {
  eventId: string;
  userId: string;
  reminderType: '15min' | '1hour' | '1day';
}

const timeLabels: Record<ReminderJob['reminderType'], string> = {
  '15min': '15 minutes',
  '1hour': '1 hour',
  '1day': '1 day',
};

// Exported queue so sync routes / event creation can enqueue jobs
export let reminderQueue: Queue<ReminderJob>;

async function processJob(job: { data: ReminderJob; id?: string }): Promise<void> {
  const { eventId, userId, reminderType } = job.data;
  logger.info('Processing calendar reminder', { jobId: job.id, eventId, userId, reminderType });

  const event = await (prisma as any).calendarEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      attendees: {
        where: { userId },
      },
    },
  });

  if (!event) {
    logger.warn(`Event ${eventId} not found or deleted, skipping reminder`);
    return;
  }

  const attendee = event.attendees?.[0];
  if (!attendee) {
    logger.warn(`User ${userId} is not an attendee of event ${eventId}, skipping`);
    return;
  }

  const label = timeLabels[reminderType];
  const startTime = new Date(event.start).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Create in-app notification via notification service
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/notifications/send`,
      {
        userId,
        tenantId: event.tenantId,
        type: 'MEETING_REMINDER',
        title: `Upcoming: ${event.title}`,
        body: `Your event starts in ${label} at ${startTime}${event.meetingLink ? ' — meeting link available' : ''}`,
        data: {
          eventId,
          reminderType,
          meetingLink: event.meetingLink || null,
          location: event.location || null,
        },
      },
      {
        headers: { 'x-service-secret': SERVICE_SECRET },
        timeout: 8000,
      }
    );
    logger.info(`Sent ${reminderType} reminder for event ${eventId} to user ${userId}`);
  } catch (err: any) {
    logger.error('Failed to send calendar reminder notification', {
      eventId,
      userId,
      reminderType,
      error: err?.message,
    });
    throw err; // Let BullMQ retry
  }
}

export function startEventReminderWorker(redis: Redis): Worker<ReminderJob> {
  const connection = redis;

  reminderQueue = new Queue<ReminderJob>(QUEUE_NAME, { connection });

  const worker = new Worker<ReminderJob>(
    QUEUE_NAME,
    async (job) => {
      await processJob(job);
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Reminder job failed', { jobId: job?.id, error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Reminder worker error', { error: err.message });
  });

  logger.info('Calendar event reminder worker started');
  return worker;
}

/**
 * Schedule reminder jobs for an event for a specific user.
 * Call this when an event is created or updated.
 */
export async function scheduleReminders(
  eventId: string,
  userId: string,
  startAt: Date
): Promise<void> {
  if (!reminderQueue) {
    logger.warn('Reminder queue not initialized, skipping schedule');
    return;
  }

  const now = Date.now();
  const startMs = startAt.getTime();

  const reminders: Array<{ type: ReminderJob['reminderType']; offset: number }> = [
    { type: '1day', offset: 24 * 60 * 60 * 1000 },
    { type: '1hour', offset: 60 * 60 * 1000 },
    { type: '15min', offset: 15 * 60 * 1000 },
  ];

  for (const { type, offset } of reminders) {
    const fireAt = startMs - offset;
    if (fireAt <= now) continue; // already passed

    const delay = fireAt - now;
    const jobId = `reminder:${eventId}:${userId}:${type}`;

    await reminderQueue.add(
      'send-reminder',
      { eventId, userId, reminderType: type },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      }
    );
    logger.info(`Scheduled ${type} reminder for event ${eventId} user ${userId}`, { delay, jobId });
  }
}
