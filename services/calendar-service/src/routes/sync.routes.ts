import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';
import { syncFromGoogle, watchCalendar } from '../services/google-calendar.service';
import { syncFromMicrosoft } from '../services/microsoft-calendar.service';
import { decryptToken } from '../services/calendar.service';

const logger = createLogger('calendar-service:sync');
export const syncRouter = Router();

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

syncRouter.use(auth);

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

const MICROSOFT_CALENDAR_SCOPES = [
  'Calendars.ReadWrite',
  'offline_access',
  'User.Read',
].join(' ');

// ─── POST /sync/google/connect ────────────────────────────────────────────────
syncRouter.post('/google/connect', async (req: any, res: Response) => {
  try {
    const state = Buffer.from(
      JSON.stringify({ userId: req.user.sub, tenantId: req.user.tenantId, provider: 'google', ts: Date.now() })
    ).toString('base64');

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/sync/google/callback`,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ success: true, data: { authUrl } });
  } catch (err) {
    logger.error('Google connect error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /sync/google/callback ────────────────────────────────────────────────
syncRouter.get('/google/callback', async (req: any, res: Response) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ success: false, error: 'Missing code or state' });
      return;
    }

    let stateData: { userId: string; tenantId: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      res.status(400).json({ success: false, error: 'Invalid state' });
      return;
    }

    // Exchange code for tokens
    const axios = require('axios');
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code: code as string,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/sync/google/callback`,
        grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const crypto = require('crypto');
    const encKey = Buffer.from((process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64)).slice(0, 64), 'hex');

    function encryptTok(plain: string): string {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
      const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
    }

    await (prisma as any).calendarIntegration.upsert({
      where: { userId_provider: { userId: stateData.userId, provider: 'google' } },
      create: {
        userId: stateData.userId,
        tenantId: stateData.tenantId,
        provider: 'google',
        accessToken: encryptTok(access_token),
        refreshToken: refresh_token ? encryptTok(refresh_token) : null,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        status: 'ACTIVE',
      },
      update: {
        accessToken: encryptTok(access_token),
        refreshToken: refresh_token ? encryptTok(refresh_token) : undefined,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?provider=google&status=connected`);
  } catch (err) {
    logger.error('Google callback error', { err });
    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?error=google_oauth_failed`);
  }
});

// ─── POST /sync/google/sync ───────────────────────────────────────────────────
syncRouter.post('/google/sync', async (req: any, res: Response) => {
  try {
    const integration = await (prisma as any).calendarIntegration.findFirst({
      where: { userId: req.user.sub, provider: 'google', status: 'ACTIVE' },
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Google Calendar not connected' });
      return;
    }

    const accessToken = decryptToken(integration.accessToken);
    const count = await syncFromGoogle(req.user.sub, accessToken, req.user.tenantId);

    // Set up push notifications if not already watching
    try {
      await watchCalendar(req.user.sub, accessToken);
    } catch (watchErr) {
      logger.warn('Failed to set up Google Calendar watch', { err: watchErr });
    }

    await (prisma as any).calendarIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    res.json({ success: true, data: { syncedEvents: count } });
  } catch (err) {
    logger.error('Google sync error', { err });
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

// ─── POST /sync/microsoft/connect ─────────────────────────────────────────────
syncRouter.post('/microsoft/connect', async (req: any, res: Response) => {
  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const state = Buffer.from(
      JSON.stringify({ userId: req.user.sub, tenantId: req.user.tenantId, provider: 'microsoft', ts: Date.now() })
    ).toString('base64');

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/sync/microsoft/callback`,
      response_type: 'code',
      scope: MICROSOFT_CALENDAR_SCOPES,
      state,
    });

    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    res.json({ success: true, data: { authUrl } });
  } catch (err) {
    logger.error('Microsoft connect error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /sync/microsoft/callback ─────────────────────────────────────────────
syncRouter.get('/microsoft/callback', async (req: any, res: Response) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ success: false, error: 'Missing code or state' });
      return;
    }

    let stateData: { userId: string; tenantId: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      res.status(400).json({ success: false, error: 'Invalid state' });
      return;
    }

    const msTenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const axios = require('axios');
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${msTenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        code: code as string,
        client_id: process.env.MICROSOFT_CLIENT_ID || '',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
        redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/sync/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: MICROSOFT_CALENDAR_SCOPES,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const crypto = require('crypto');
    const encKey = Buffer.from((process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64)).slice(0, 64), 'hex');

    function encryptTok(plain: string): string {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
      const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
    }

    await (prisma as any).calendarIntegration.upsert({
      where: { userId_provider: { userId: stateData.userId, provider: 'microsoft' } },
      create: {
        userId: stateData.userId,
        tenantId: stateData.tenantId,
        provider: 'microsoft',
        accessToken: encryptTok(access_token),
        refreshToken: refresh_token ? encryptTok(refresh_token) : null,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        status: 'ACTIVE',
      },
      update: {
        accessToken: encryptTok(access_token),
        refreshToken: refresh_token ? encryptTok(refresh_token) : undefined,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?provider=microsoft&status=connected`);
  } catch (err) {
    logger.error('Microsoft callback error', { err });
    res.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/settings/calendar?error=microsoft_oauth_failed`);
  }
});

// ─── POST /sync/microsoft/sync ────────────────────────────────────────────────
syncRouter.post('/microsoft/sync', async (req: any, res: Response) => {
  try {
    const integration = await (prisma as any).calendarIntegration.findFirst({
      where: { userId: req.user.sub, provider: 'microsoft', status: 'ACTIVE' },
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Microsoft Calendar not connected' });
      return;
    }

    const accessToken = decryptToken(integration.accessToken);
    const count = await syncFromMicrosoft(req.user.sub, accessToken, req.user.tenantId);

    await (prisma as any).calendarIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    res.json({ success: true, data: { syncedEvents: count } });
  } catch (err) {
    logger.error('Microsoft sync error', { err });
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});
