import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import axios from 'axios';
import { createLogger } from '@comms/logger';
import { REMINDER_QUEUE, ReminderJobData } from '../services/reminder.service';

const logger = createLogger('bot-service:reminder-worker');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

async function processReminderJob(job: Job<ReminderJobData>): Promise<void> {
  const { userId, channelId, message, tenantId, createdBy } = job.data;
  logger.info('Processing reminder job', { jobId: job.id, userId, message });

  try {
    // Send push / in-app notification via notification-service
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/notifications/send`,
      {
        userId,
        tenantId,
        type: 'REMINDER',
        title: '⏰ Reminder',
        body: message,
        data: { channelId, createdBy, jobId: job.id },
      },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );

    // Also post the reminder message in the channel
    await axios.post(
      `${CHAT_SERVICE_URL}/messages`,
      {
        channelId,
        tenantId,
        content: `⏰ <@${userId}> Reminder: ${message}`,
        isBot: true,
        botName: 'ReminderBot',
        metadata: { type: 'reminder', userId, jobId: job.id },
      },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );

    logger.info('Reminder delivered', { jobId: job.id, userId });
  } catch (err) {
    logger.error('Failed to deliver reminder', { jobId: job.id, userId, err });
    throw err; // Let BullMQ retry
  }
}

export function startReminderWorker(redis: Redis): Worker<ReminderJobData> {
  const worker = new Worker<ReminderJobData>(REMINDER_QUEUE, processReminderJob, {
    connection: redis,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info('Reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Reminder job failed', { jobId: job?.id, err: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Reminder worker error', { err });
  });

  logger.info('Reminder worker started');
  return worker;
}
