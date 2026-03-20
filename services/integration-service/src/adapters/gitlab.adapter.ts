import axios from 'axios';
import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:gitlab');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

// ─── Token verification ───────────────────────────────────────────────────────

export function verifyToken(token: string, expectedToken: string): boolean {
  if (!token || !expectedToken) return false;
  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    );
  } catch {
    return false;
  }
}

// ─── Push event ───────────────────────────────────────────────────────────────

export async function handlePush(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { project, commits, user_name, ref, compare } = payload;
  if (!commits || commits.length === 0) return;

  const branch = ref?.replace('refs/heads/', '') || 'unknown';
  const commitLines = commits.slice(0, 5).map((c: any) => {
    const shortId = c.id.slice(0, 8);
    const msg = c.message.split('\n')[0].slice(0, 80);
    return `• [\`${shortId}\`](${c.url}) ${msg} — ${c.author?.name || 'unknown'}`;
  });

  const moreCount = commits.length > 5 ? commits.length - 5 : 0;
  const moreText = moreCount > 0 ? `\n_...and ${moreCount} more commits_` : '';

  const content = [
    `🔀 *[${project?.path_with_namespace || project?.name}]* ${user_name} pushed ${commits.length} commit${commits.length !== 1 ? 's' : ''} to \`${branch}\``,
    commitLines.join('\n'),
    moreText,
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'gitlab.push', branch });
}

// ─── Merge request event ──────────────────────────────────────────────────────

export async function handleMergeRequest(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { object_attributes: mr, project, user } = payload;
  if (!mr) return;

  const IGNORED_STATES = ['update'];
  if (IGNORED_STATES.includes(mr.action)) return;

  const emoji: Record<string, string> = {
    open: '🟢',
    close: '🔴',
    reopen: '🔁',
    merge: '🟣',
  };

  const icon = emoji[mr.action] || '📌';
  const sourceBranch = mr.source_branch || 'unknown';
  const targetBranch = mr.target_branch || 'unknown';

  const content = [
    `${icon} *[${project?.path_with_namespace || project?.name}]* MR ${mr.action}: [!${mr.iid} ${mr.title}](${mr.url})`,
    `_${user?.name || 'unknown'} · \`${sourceBranch}\` → \`${targetBranch}\`_`,
    mr.description ? mr.description.slice(0, 200) + (mr.description.length > 200 ? '…' : '') : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'gitlab.merge_request', action: mr.action, mrIid: mr.iid });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function postToChannel(
  channelId: string,
  tenantId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await axios.post(
      `${CHAT_SERVICE_URL}/messages`,
      { channelId, tenantId, content, isBot: true, botName: 'GitLab', metadata },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );
  } catch (err) {
    logger.error('Failed to post GitLab event to channel', { err, channelId });
  }
}
