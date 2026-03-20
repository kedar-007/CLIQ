import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { redis } from '../config/redis';
import { createLogger } from '@comms/logger';

const logger = createLogger('auth-service:email-worker');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: process.env.SMTP_PORT === '465',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

const templates: Record<string, (vars: Record<string, unknown>) => { subject: string; html: string }> = {
  welcome: (vars) => ({
    subject: 'Welcome to CommsPlatform — Verify your email',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #6366f1; margin-bottom: 8px;">Welcome to CommsPlatform!</h1>
        <p>Hi ${vars.name},</p>
        <p>Thanks for signing up! Please verify your email address to get started.</p>
        <a href="${vars.verificationUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Verify Email
        </a>
        <p style="color:#64748b;font-size:14px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `,
  }),
  'password-reset': (vars) => ({
    subject: 'Reset your CommsPlatform password',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #6366f1;">Reset your password</h1>
        <p>Hi ${vars.name},</p>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${vars.resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Reset Password
        </a>
        <p style="color:#64748b;font-size:14px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  }),
};

const worker = new Worker(
  'email',
  async (job: Job) => {
    const { to, template, variables } = job.data;
    const tmpl = templates[template];

    if (!tmpl) {
      logger.warn(`Unknown email template: ${template}`);
      return;
    }

    const { subject, html } = tmpl(variables);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@commsplatform.local',
      to,
      subject,
      html,
    });

    logger.info('Email sent', { to, template });
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

worker.on('completed', (job) => logger.info('Email job completed', { jobId: job.id }));
worker.on('failed', (job, err) => logger.error('Email job failed', { jobId: job?.id, error: err.message }));

export default worker;
