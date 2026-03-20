import crypto from 'crypto';
import axios from 'axios';
import { Octokit } from '@octokit/rest';
import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:github');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

// ─── Webhook signature verification ──────────────────────────────────────────

export function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const digest = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

// ─── Push event ───────────────────────────────────────────────────────────────

export async function handlePushEvent(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { repository, commits, pusher, ref, compare } = payload;
  if (!commits || commits.length === 0) return;

  const branch = ref?.replace('refs/heads/', '') || 'unknown';
  const commitLines = commits.slice(0, 5).map((c: any) => {
    const shortSha = c.id.slice(0, 7);
    const msg = c.message.split('\n')[0].slice(0, 80);
    return `• [\`${shortSha}\`](${c.url}) ${msg} — ${c.author?.name || 'unknown'}`;
  });

  const moreCount = commits.length > 5 ? commits.length - 5 : 0;
  const moreText = moreCount > 0 ? `\n_...and ${moreCount} more commits_` : '';

  const content = [
    `🔀 *[${repository.full_name}]* ${pusher.name} pushed ${commits.length} commit${commits.length !== 1 ? 's' : ''} to \`${branch}\``,
    commitLines.join('\n'),
    moreText,
    compare ? `[View diff](${compare})` : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'github.push', repo: repository.full_name, branch });
}

// ─── Pull request event ───────────────────────────────────────────────────────

export async function handlePullRequestEvent(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { action, pull_request: pr, repository } = payload;
  if (!pr) return;

  const IGNORED_ACTIONS = ['synchronize', 'ready_for_review', 'review_requested'];
  if (IGNORED_ACTIONS.includes(action)) return;

  const emoji: Record<string, string> = {
    opened: '🟢',
    closed: pr.merged ? '🟣' : '🔴',
    reopened: '🔁',
    edited: '✏️',
  };

  const statusText: Record<string, string> = {
    opened: 'opened',
    closed: pr.merged ? 'merged' : 'closed',
    reopened: 'reopened',
    edited: 'edited',
  };

  const icon = emoji[action] || '📌';
  const status = statusText[action] || action;

  const content = [
    `${icon} *[${repository.full_name}]* PR ${status}: [#${pr.number} ${pr.title}](${pr.html_url})`,
    `_${pr.user.login} · ${pr.additions} additions, ${pr.deletions} deletions · ${pr.changed_files} files changed_`,
    pr.body ? pr.body.slice(0, 200) + (pr.body.length > 200 ? '…' : '') : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'github.pull_request', action, prNumber: pr.number });
}

// ─── Issue event ──────────────────────────────────────────────────────────────

export async function handleIssueEvent(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { action, issue, repository } = payload;
  if (!issue) return;

  const TRACKED_ACTIONS = ['opened', 'closed', 'reopened', 'assigned'];
  if (!TRACKED_ACTIONS.includes(action)) return;

  const emoji: Record<string, string> = {
    opened: '🐛',
    closed: '✅',
    reopened: '🔁',
    assigned: '👤',
  };

  const icon = emoji[action] || '📌';
  const labelsText = issue.labels?.map((l: any) => `\`${l.name}\``).join(', ') || '';

  const content = [
    `${icon} *[${repository.full_name}]* Issue ${action}: [#${issue.number} ${issue.title}](${issue.html_url})`,
    labelsText ? `Labels: ${labelsText}` : '',
    action === 'assigned' && issue.assignee ? `Assigned to: ${issue.assignee.login}` : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'github.issue', action, issueNumber: issue.number });
}

// ─── Release event ────────────────────────────────────────────────────────────

export async function handleReleaseEvent(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const { action, release, repository } = payload;
  if (!release || action !== 'published') return;

  const content = [
    `🚀 *[${repository.full_name}]* New release: [${release.tag_name}](${release.html_url})`,
    release.name ? `*${release.name}*` : '',
    release.body ? release.body.slice(0, 300) + (release.body.length > 300 ? '…' : '') : '',
    release.prerelease ? '_Pre-release_' : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, { type: 'github.release', tag: release.tag_name });
}

// ─── Repo info ────────────────────────────────────────────────────────────────

export async function getRepoInfo(
  owner: string,
  repo: string,
  token?: string
): Promise<Record<string, unknown>> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.get({ owner, repo });

  return {
    id: data.id,
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    language: data.language,
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
    isPrivate: data.private,
  };
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
      { channelId, tenantId, content, isBot: true, botName: 'GitHub', metadata },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );
  } catch (err) {
    logger.error('Failed to post GitHub event to channel', { err, channelId });
  }
}
