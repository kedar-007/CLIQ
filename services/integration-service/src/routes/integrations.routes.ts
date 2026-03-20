import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';
import {
  getAuthorizationUrl,
  exchangeCode,
} from '../services/oauth.service';

const logger = createLogger('integration-service:integrations');
export const integrationsRouter = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

integrationsRouter.use(auth);

// ─── Integration catalog ──────────────────────────────────────────────────────
const INTEGRATION_CATALOG = [
  { provider: 'github',    name: 'GitHub',    category: 'development', iconUrl: '/integrations/github.svg',    supportsOAuth: true },
  { provider: 'gitlab',    name: 'GitLab',    category: 'development', iconUrl: '/integrations/gitlab.svg',    supportsOAuth: true },
  { provider: 'jira',      name: 'Jira',      category: 'project',     iconUrl: '/integrations/jira.svg',      supportsOAuth: true },
  { provider: 'stripe',    name: 'Stripe',    category: 'payments',    iconUrl: '/integrations/stripe.svg',    supportsOAuth: false },
  { provider: 'pagerduty', name: 'PagerDuty', category: 'ops',         iconUrl: '/integrations/pagerduty.svg', supportsOAuth: true },
];

// GET /integrations — list with install status per workspace
integrationsRouter.get('/', async (req: any, res: Response) => {
  try {
    const installations = await (prisma as any).integration.findMany({
      where: { tenantId: req.user.tenantId, deletedAt: null },
      select: { provider: true, status: true, lastSyncAt: true },
    });

    const installedMap = new Map(installations.map((i: any) => [i.provider, i]));

    const integrations = INTEGRATION_CATALOG.map((cat) => ({
      ...cat,
      installed: installedMap.has(cat.provider),
      status: installedMap.get(cat.provider)?.status || null,
      lastSyncAt: installedMap.get(cat.provider)?.lastSyncAt || null,
    }));

    res.json({ success: true, data: integrations });
  } catch (err) {
    logger.error('List integrations error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /integrations/:provider/install — OAuth install flow
integrationsRouter.post('/:provider/install', async (req: any, res: Response) => {
  try {
    const { provider } = req.params;
    const catalog = INTEGRATION_CATALOG.find((c) => c.provider === provider);
    if (!catalog) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    const state = Buffer.from(JSON.stringify({ tenantId: req.user.tenantId, userId: req.user.sub, ts: Date.now() })).toString('base64');
    const authUrl = getAuthorizationUrl(provider, req.user.tenantId, state);

    res.json({ success: true, data: { authUrl, state } });
  } catch (err) {
    logger.error('Install integration error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /integrations/:provider/callback — OAuth callback
integrationsRouter.get('/:provider/callback', async (req: any, res: Response) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/integrations?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ success: false, error: 'Missing code or state' });
      return;
    }

    const integration = await exchangeCode(provider, String(code), String(state));

    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/integrations?provider=${provider}&status=success&id=${integration.id}`);
  } catch (err) {
    logger.error('OAuth callback error', { err, provider: req.params.provider });
    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/integrations?error=oauth_failed`);
  }
});

// DELETE /integrations/:provider/uninstall
integrationsRouter.delete('/:provider/uninstall', async (req: any, res: Response) => {
  try {
    const { provider } = req.params;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not installed' });
      return;
    }

    await (prisma as any).integration.update({
      where: { id: integration.id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });

    res.json({ success: true, message: `${provider} integration removed` });
  } catch (err) {
    logger.error('Uninstall integration error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /integrations/:provider/status
integrationsRouter.get('/:provider/status', async (req: any, res: Response) => {
  try {
    const { provider } = req.params;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider, tenantId: req.user.tenantId, deletedAt: null },
      select: { id: true, status: true, lastSyncAt: true, errorMessage: true, expiresAt: true },
    });

    if (!integration) {
      res.json({ success: true, data: { installed: false } });
      return;
    }

    const isTokenExpired = integration.expiresAt ? new Date(integration.expiresAt) < new Date() : false;

    res.json({
      success: true,
      data: {
        installed: true,
        ...integration,
        isTokenExpired,
      },
    });
  } catch (err) {
    logger.error('Integration status error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /integrations/:provider/sync — manual sync trigger
integrationsRouter.post('/:provider/sync', async (req: any, res: Response) => {
  try {
    const { provider } = req.params;

    const integration = await (prisma as any).integration.findFirst({
      where: { provider, tenantId: req.user.tenantId, deletedAt: null, status: 'ACTIVE' },
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found or inactive' });
      return;
    }

    // Queue sync job
    await (prisma as any).integrationSyncJob.create({
      data: {
        integrationId: integration.id,
        tenantId: req.user.tenantId,
        provider,
        status: 'QUEUED',
        requestedBy: req.user.sub,
      },
    });

    res.json({ success: true, message: `${provider} sync queued` });
  } catch (err) {
    logger.error('Sync integration error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});
