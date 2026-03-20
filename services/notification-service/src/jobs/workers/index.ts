import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';

const logger = createLogger('notification-service:workers');

export function startWorkers(redis: Redis): void {
  // Initialize web-push and nodemailer inside the function so dotenv has run first
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@commsplatform.local',
    process.env.VAPID_PUBLIC_KEY || '',
    process.env.VAPID_PRIVATE_KEY || ''
  );

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  // In-app notification worker
  const inAppWorker = new Worker('notifications', async (job: Job) => {
    const { userId, tenantId, type, title, body, data, channels } = job.data;

    if (channels?.includes('in-app')) {
      const notification = await prisma.notification.create({
        data: { userId, tenantId, type, title, body, data: data || {}, channelId: data?.channelId, messageId: data?.messageId, taskId: data?.taskId },
      });
      logger.info('In-app notification created', { notificationId: notification.id });
    }

    if (channels?.includes('push')) {
      // Get user's push subscriptions from Redis
      const subsJson = await redis.get(`push_subscriptions:${userId}`);
      if (subsJson) {
        const subscriptions = JSON.parse(subsJson);
        for (const sub of subscriptions) {
          webpush.sendNotification(sub, JSON.stringify({ title, body, data })).catch((err) => {
            logger.warn('Push notification failed', { userId, err: err.message });
          });
        }
      }
    }

    if (channels?.includes('email')) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      const pref = await prisma.userPreference.findUnique({ where: { userId } });

      if (user && (!pref || pref.emailDigest === 'INSTANT')) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@commsplatform.local',
          to: user.email,
          subject: title,
          html: `<p>Hi ${user.name},</p><p>${body}</p>`,
        }).catch((err) => logger.error('Email send failed', { err }));
      }
    }
  }, { connection: redis, concurrency: 10 });

  inAppWorker.on('failed', (job, err) => logger.error('Notification job failed', { jobId: job?.id, err }));

  // Email worker for templates
  const emailWorker = new Worker('email', async (job: Job) => {
    const { to, subject, template, variables } = job.data;
    const html = renderEmailTemplate(template, variables);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@commsplatform.local',
      to,
      subject,
      html,
    });
    logger.info('Template email sent', { to, template });
  }, { connection: redis, concurrency: 5 });

  emailWorker.on('failed', (job, err) => logger.error('Email job failed', { jobId: job?.id, err }));

  logger.info('Notification workers started');
}

function renderEmailTemplate(template: string, variables: Record<string, unknown>): string {
  const base = `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">`;
  switch (template) {
    case 'welcome':
      return `${base}<h2 style="color:#6366f1">Welcome, ${variables.name}!</h2>
        <p>Your workspace is ready. <a href="${variables.verificationUrl}">Verify your email</a> to get started.</p></div>`;
    case 'password-reset':
      return `${base}<h2>Reset your password</h2>
        <p>Hi ${variables.name}, <a href="${variables.resetUrl}">Click here to reset your password</a>. Expires in 1 hour.</p></div>`;
    case 'task-reminder':
      return `${base}<h2>Task reminder</h2>
        <p>Task "${variables.taskTitle}" is due ${variables.dueAt}.</p></div>`;
    case 'meeting-reminder':
      return `${base}<h2>Meeting starting soon</h2>
        <p>${variables.meetingTitle} starts at ${variables.startAt}. <a href="${variables.joinUrl}">Join now</a></p></div>`;
    default:
      return `${base}<p>${JSON.stringify(variables)}</p></div>`;
  }
}
