import { Queue } from 'bullmq';
import { redis } from '../config/redis';

const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export interface EmailJob {
  to: string;
  subject: string;
  template: string;
  variables: Record<string, unknown>;
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await emailQueue.add('send-email', job);
}

export async function sendWelcomeEmail(email: string, name: string, verificationToken: string): Promise<void> {
  await enqueueEmail({
    to: email,
    subject: 'Welcome to CommsPlatform — Verify your email',
    template: 'welcome',
    variables: {
      name,
      verificationUrl: `${process.env.NEXTAUTH_URL}/verify-email?token=${verificationToken}`,
    },
  });
}

export async function sendPasswordResetEmail(email: string, name: string, resetToken: string): Promise<void> {
  await enqueueEmail({
    to: email,
    subject: 'Reset your CommsPlatform password',
    template: 'password-reset',
    variables: {
      name,
      resetUrl: `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`,
    },
  });
}
