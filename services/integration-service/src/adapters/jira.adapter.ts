import axios from 'axios';
import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:jira');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

const PRIORITY_EMOJI: Record<string, string> = {
  Highest: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
  Lowest: '⚪',
};

const TYPE_EMOJI: Record<string, string> = {
  Bug: '🐛',
  Story: '📖',
  Task: '✅',
  Epic: '⚡',
  'Sub-task': '📎',
};

// ─── Issue created ────────────────────────────────────────────────────────────

export async function handleIssueCreated(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const issue = payload.issue;
  if (!issue) return;

  const fields = issue.fields || {};
  const priority = fields.priority?.name || 'Medium';
  const issueType = fields.issuetype?.name || 'Task';
  const assignee = fields.assignee?.displayName || 'Unassigned';
  const reporter = fields.reporter?.displayName || 'Unknown';
  const jiraBaseUrl = payload.baseUrl || '';

  const priorityIcon = PRIORITY_EMOJI[priority] || '🟡';
  const typeIcon = TYPE_EMOJI[issueType] || '📌';

  const content = [
    `${typeIcon} *New Jira ${issueType}:* [${issue.key}: ${fields.summary}](${jiraBaseUrl}/browse/${issue.key})`,
    `${priorityIcon} Priority: *${priority}* · Reporter: ${reporter} · Assignee: ${assignee}`,
    fields.description ? fields.description.slice(0, 200) + (fields.description.length > 200 ? '…' : '') : '',
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'jira.issue_created',
    issueKey: issue.key,
    issueType,
    priority,
  });
}

// ─── Issue updated ────────────────────────────────────────────────────────────

export async function handleIssueUpdated(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const issue = payload.issue;
  const changelog = payload.changelog;
  if (!issue || !changelog) return;

  const fields = issue.fields || {};
  const jiraBaseUrl = payload.baseUrl || '';
  const changedBy = payload.user?.displayName || 'Unknown';

  const changeLines = (changelog.items || [])
    .filter((item: any) => ['status', 'assignee', 'priority', 'summary'].includes(item.field))
    .map((item: any) => `• *${item.field}*: ${item.fromString || 'none'} → ${item.toString || 'none'}`);

  if (changeLines.length === 0) return;

  const content = [
    `✏️ *Jira Issue Updated:* [${issue.key}: ${fields.summary}](${jiraBaseUrl}/browse/${issue.key})`,
    `_Updated by ${changedBy}:_`,
    changeLines.join('\n'),
  ].join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'jira.issue_updated',
    issueKey: issue.key,
    changes: changelog.items?.map((i: any) => i.field),
  });
}

// ─── Issue commented ──────────────────────────────────────────────────────────

export async function handleIssueCommented(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const issue = payload.issue;
  const comment = payload.comment;
  if (!issue || !comment) return;

  const fields = issue.fields || {};
  const jiraBaseUrl = payload.baseUrl || '';
  const author = comment.author?.displayName || 'Unknown';
  const body = comment.body?.slice(0, 300) || '';

  const content = [
    `💬 *New comment on:* [${issue.key}: ${fields.summary}](${jiraBaseUrl}/browse/${issue.key})`,
    `_${author}:_ ${body}${(comment.body?.length || 0) > 300 ? '…' : ''}`,
  ].join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'jira.comment',
    issueKey: issue.key,
    commentId: comment.id,
  });
}

// ─── JQL search ───────────────────────────────────────────────────────────────

export async function searchIssues(
  query: string,
  auth: { baseUrl: string; email: string; apiToken: string }
): Promise<unknown[]> {
  const response = await axios.get(`${auth.baseUrl}/rest/api/3/search`, {
    params: { jql: query, maxResults: 20, fields: 'summary,status,priority,assignee,issuetype' },
    auth: { username: auth.email, password: auth.apiToken },
    timeout: 10000,
  });

  return response.data.issues || [];
}

// ─── Create issue ─────────────────────────────────────────────────────────────

export async function createIssue(
  data: {
    projectKey: string;
    summary: string;
    description?: string;
    issueType?: string;
    priority?: string;
    assigneeAccountId?: string;
  },
  auth: { baseUrl: string; email: string; apiToken: string }
): Promise<{ key: string; id: string; url: string }> {
  const response = await axios.post(
    `${auth.baseUrl}/rest/api/3/issue`,
    {
      fields: {
        project: { key: data.projectKey },
        summary: data.summary,
        description: data.description
          ? {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: data.description }] }],
            }
          : undefined,
        issuetype: { name: data.issueType || 'Task' },
        priority: data.priority ? { name: data.priority } : undefined,
        assignee: data.assigneeAccountId ? { accountId: data.assigneeAccountId } : undefined,
      },
    },
    {
      auth: { username: auth.email, password: auth.apiToken },
      timeout: 10000,
    }
  );

  return {
    key: response.data.key,
    id: response.data.id,
    url: `${auth.baseUrl}/browse/${response.data.key}`,
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
      { channelId, tenantId, content, isBot: true, botName: 'Jira', metadata },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );
  } catch (err) {
    logger.error('Failed to post Jira event to channel', { err, channelId });
  }
}
