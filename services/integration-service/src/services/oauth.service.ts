import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:oauth');

// AES-256-GCM constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY = Buffer.from(
  (process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64)).slice(0, 64),
  'hex'
);

// ─── Token encryption / decryption ───────────────────────────────────────────

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptToken(encryptedStr: string): string {
  const [ivB64, tagB64, encB64] = encryptedStr.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Provider OAuth configs ───────────────────────────────────────────────────

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getProviderConfig(provider: string): ProviderConfig {
  const base = process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3010';
  const redirectUri = `${base}/integrations/${provider}/callback`;

  const configs: Record<string, ProviderConfig> = {
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'repo,read:org',
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      redirectUri,
    },
    gitlab: {
      authUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      scope: 'api read_user',
      clientId: process.env.GITLAB_CLIENT_ID || '',
      clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
      redirectUri,
    },
    jira: {
      authUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scope: 'read:jira-work write:jira-work read:jira-user offline_access',
      clientId: process.env.JIRA_CLIENT_ID || '',
      clientSecret: process.env.JIRA_CLIENT_SECRET || '',
      redirectUri,
    },
    pagerduty: {
      authUrl: 'https://app.pagerduty.com/oauth/authorize',
      tokenUrl: 'https://app.pagerduty.com/oauth/token',
      scope: 'read write',
      clientId: process.env.PAGERDUTY_CLIENT_ID || '',
      clientSecret: process.env.PAGERDUTY_CLIENT_SECRET || '',
      redirectUri,
    },
  };

  const config = configs[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);
  return config;
}

// ─── Build authorization URL ──────────────────────────────────────────────────

export function getAuthorizationUrl(
  provider: string,
  workspaceId: string,
  state: string
): string {
  const config = getProviderConfig(provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    response_type: 'code',
  });

  // Jira requires audience param
  if (provider === 'jira') {
    params.set('audience', 'api.atlassian.com');
    params.set('prompt', 'consent');
  }

  return `${config.authUrl}?${params.toString()}`;
}

// ─── Exchange authorization code for tokens ───────────────────────────────────

export async function exchangeCode(
  provider: string,
  code: string,
  stateB64: string
): Promise<{ id: string }> {
  const config = getProviderConfig(provider);

  let stateData: { tenantId: string; userId: string };
  try {
    stateData = JSON.parse(Buffer.from(stateB64, 'base64').toString());
  } catch {
    throw new Error('Invalid state parameter');
  }

  // Exchange code
  const tokenResponse = await axios.post(
    config.tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );

  const { access_token, refresh_token, expires_in, token_type, scope } = tokenResponse.data;

  // Encrypt tokens
  const encryptedAccessToken = encryptToken(access_token);
  const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;
  const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

  // Upsert integration record
  const integration = await (prisma as any).integration.upsert({
    where: {
      tenantId_provider: {
        tenantId: stateData.tenantId,
        provider,
      },
    },
    create: {
      tenantId: stateData.tenantId,
      provider,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt,
      scope,
      tokenType: token_type || 'Bearer',
      status: 'ACTIVE',
      installedBy: stateData.userId,
    },
    update: {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt,
      scope,
      status: 'ACTIVE',
      updatedAt: new Date(),
      deletedAt: null,
    },
  });

  logger.info('OAuth tokens stored', { provider, tenantId: stateData.tenantId, integrationId: integration.id });
  return { id: integration.id };
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export async function refreshToken(
  provider: string,
  integration: { id: string; refreshToken: string }
): Promise<void> {
  const config = getProviderConfig(provider);

  const decryptedRefreshToken = decryptToken(integration.refreshToken);

  const tokenResponse = await axios.post(
    config.tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  const encryptedAccessToken = encryptToken(access_token);
  const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : integration.refreshToken;
  const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

  await (prisma as any).integration.update({
    where: { id: integration.id },
    data: {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt,
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  });

  logger.info('Token refreshed', { provider, integrationId: integration.id });
}
