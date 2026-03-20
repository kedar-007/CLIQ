import { Router, Request, Response } from 'express';
import { createLogger } from '@comms/logger';
import { prisma } from '@comms/db';
import {
  verifyWebhookSignature as verifyGitHubSignature,
  handlePushEvent,
  handlePullRequestEvent,
  handleIssueEvent,
  handleReleaseEvent,
} from '../adapters/github.adapter';
import {
  verifyToken as verifyGitLabToken,
  handlePush as handleGitLabPush,
  handleMergeRequest,
} from '../adapters/gitlab.adapter';
import {
  handleIssueCreated,
  handleIssueUpdated,
  handleIssueCommented,
} from '../adapters/jira.adapter';
import {
  handleIncidentCreated,
  handleIncidentAcknowledged,
  handleIncidentResolved,
} from '../adapters/pagerduty.adapter';

const logger = createLogger('integration-service:provider-webhooks');
export const providerWebhooksRouter = Router();

// Helper to get channel config for integration
async function getIntegrationChannelId(provider: string, tenantId?: string): Promise<string | null> {
  const integration = await (prisma as any).integration.findFirst({
    where: { provider, ...(tenantId ? { tenantId } : {}), deletedAt: null, status: 'ACTIVE' },
    select: { channelId: true, tenantId: true },
  });
  return integration?.channelId || null;
}

// ─── GitHub ───────────────────────────────────────────────────────────────────
// POST /integrations/webhooks/github
providerWebhooksRouter.post('/github', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));

    // Find integration by repository or sender
    const payload = JSON.parse(rawBody.toString());
    const repoFullName = payload.repository?.full_name;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider: 'github', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, webhookSecret: true, channelId: true, tenantId: true },
    });

    if (!integration) {
      res.status(200).json({ ok: true }); // Accept but don't process
      return;
    }

    if (integration.webhookSecret && signature) {
      const isValid = verifyGitHubSignature(rawBody, signature, integration.webhookSecret);
      if (!isValid) {
        logger.warn('GitHub webhook signature verification failed', { deliveryId });
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const channelId = integration.channelId;
    const tenantId = integration.tenantId;

    if (!channelId) {
      res.status(200).json({ ok: true });
      return;
    }

    switch (event) {
      case 'push':
        await handlePushEvent(payload, channelId, tenantId);
        break;
      case 'pull_request':
        await handlePullRequestEvent(payload, channelId, tenantId);
        break;
      case 'issues':
        await handleIssueEvent(payload, channelId, tenantId);
        break;
      case 'release':
        await handleReleaseEvent(payload, channelId, tenantId);
        break;
      default:
        logger.debug('Unhandled GitHub event', { event, deliveryId });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('GitHub webhook error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── GitLab ───────────────────────────────────────────────────────────────────
// POST /integrations/webhooks/gitlab
providerWebhooksRouter.post('/gitlab', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-gitlab-token'] as string;
    const event = req.headers['x-gitlab-event'] as string;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider: 'gitlab', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, webhookSecret: true, channelId: true, tenantId: true },
    });

    if (!integration) {
      res.status(200).json({ ok: true });
      return;
    }

    if (integration.webhookSecret) {
      const isValid = verifyGitLabToken(token, integration.webhookSecret);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
    }

    const channelId = integration.channelId;
    const tenantId = integration.tenantId;

    if (!channelId) {
      res.status(200).json({ ok: true });
      return;
    }

    switch (event) {
      case 'Push Hook':
        await handleGitLabPush(req.body, channelId, tenantId);
        break;
      case 'Merge Request Hook':
        await handleMergeRequest(req.body, channelId, tenantId);
        break;
      default:
        logger.debug('Unhandled GitLab event', { event });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('GitLab webhook error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Jira ─────────────────────────────────────────────────────────────────────
// POST /integrations/webhooks/jira
providerWebhooksRouter.post('/jira', async (req: Request, res: Response) => {
  try {
    const event = req.body?.webhookEvent as string;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider: 'jira', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, channelId: true, tenantId: true },
    });

    if (!integration?.channelId) {
      res.status(200).json({ ok: true });
      return;
    }

    const { channelId, tenantId } = integration;

    switch (event) {
      case 'jira:issue_created':
        await handleIssueCreated(req.body, channelId, tenantId);
        break;
      case 'jira:issue_updated':
        await handleIssueUpdated(req.body, channelId, tenantId);
        break;
      case 'comment_created':
      case 'comment_updated':
        await handleIssueCommented(req.body, channelId, tenantId);
        break;
      default:
        logger.debug('Unhandled Jira event', { event });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('Jira webhook error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Stripe ───────────────────────────────────────────────────────────────────
// POST /integrations/webhooks/stripe
providerWebhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  try {
    const stripeSignature = req.headers['stripe-signature'] as string;
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));

    const integration = await (prisma as any).integration.findFirst({
      where: { provider: 'stripe', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, webhookSecret: true, channelId: true, tenantId: true },
    });

    if (!integration?.channelId) {
      res.status(200).json({ ok: true });
      return;
    }

    // Stripe signature validation (simplified — in production use stripe.webhooks.constructEvent)
    if (integration.webhookSecret && stripeSignature) {
      const crypto = require('crypto');
      const parts = stripeSignature.split(',');
      const timestamp = parts.find((p: string) => p.startsWith('t='))?.split('=')[1];
      const v1 = parts.find((p: string) => p.startsWith('v1='))?.split('=')[1];
      const expectedSig = crypto
        .createHmac('sha256', integration.webhookSecret)
        .update(`${timestamp}.${rawBody.toString()}`)
        .digest('hex');

      if (v1 !== expectedSig) {
        res.status(401).json({ error: 'Invalid Stripe signature' });
        return;
      }
    }

    const event = JSON.parse(rawBody.toString());
    const { channelId, tenantId } = integration;

    const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
    const axios = require('axios');

    let message = '';
    switch (event.type) {
      case 'payment_intent.succeeded':
        message = `💳 Payment succeeded: $${(event.data.object.amount / 100).toFixed(2)} ${event.data.object.currency.toUpperCase()}`;
        break;
      case 'payment_intent.payment_failed':
        message = `❌ Payment failed: ${event.data.object.last_payment_error?.message || 'Unknown error'}`;
        break;
      case 'customer.subscription.created':
        message = `📦 New subscription created: ${event.data.object.id}`;
        break;
      case 'customer.subscription.deleted':
        message = `🚫 Subscription cancelled: ${event.data.object.id}`;
        break;
      case 'invoice.payment_succeeded':
        message = `✅ Invoice paid: $${(event.data.object.amount_paid / 100).toFixed(2)}`;
        break;
      case 'invoice.payment_failed':
        message = `⚠️ Invoice payment failed: ${event.data.object.id}`;
        break;
      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
        res.json({ ok: true });
        return;
    }

    await axios.post(
      `${CHAT_SERVICE_URL}/messages`,
      { channelId, tenantId, content: message, isBot: true, botName: 'Stripe', metadata: { stripeEventId: event.id, type: event.type } },
      { headers: { 'x-service-secret': process.env.SERVICE_SECRET || 'internal' } }
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error('Stripe webhook error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── PagerDuty ────────────────────────────────────────────────────────────────
// POST /integrations/webhooks/pagerduty
providerWebhooksRouter.post('/pagerduty', async (req: Request, res: Response) => {
  try {
    const events = req.body?.messages || req.body?.payload ? [req.body] : req.body?.messages || [];

    const integration = await (prisma as any).integration.findFirst({
      where: { provider: 'pagerduty', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, channelId: true, tenantId: true },
    });

    if (!integration?.channelId) {
      res.status(200).json({ ok: true });
      return;
    }

    const { channelId, tenantId } = integration;

    for (const event of events) {
      const eventType = event.event || event.payload?.summary;

      if (eventType?.includes('incident.trigger') || event.type === 'incident.trigger') {
        await handleIncidentCreated(event, channelId, tenantId);
      } else if (eventType?.includes('incident.acknowledge') || event.type === 'incident.acknowledge') {
        await handleIncidentAcknowledged(event, channelId, tenantId);
      } else if (eventType?.includes('incident.resolve') || event.type === 'incident.resolve') {
        await handleIncidentResolved(event, channelId, tenantId);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('PagerDuty webhook error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});
