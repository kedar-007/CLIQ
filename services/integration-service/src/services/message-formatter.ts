import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:message-formatter');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageAttachment {
  color: string;
  title: string;
  titleLink?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short: boolean }>;
  footer?: string;
  ts?: number;
  authorName?: string;
  authorLink?: string;
}

export interface FormattedMessage {
  text: string;
  attachments: MessageAttachment[];
}

// ─── GitHub Push ──────────────────────────────────────────────────────────────

export function formatGitHubPush(payload: any): FormattedMessage {
  const { repository, commits = [], pusher, ref } = payload;
  const branch = ref?.replace('refs/heads/', '') ?? 'unknown';
  const repoName = repository?.full_name ?? 'unknown/repo';
  const pusherName = pusher?.name ?? 'Someone';
  const commitCount = commits.length;

  const fields: MessageAttachment['fields'] = commits
    .slice(0, 5)
    .map((c: any) => ({
      title: `\`${String(c.id ?? c.sha ?? '').slice(0, 7)}\` by ${c.author?.name ?? c.committer?.name ?? 'unknown'}`,
      value: c.message?.split('\n')[0]?.slice(0, 100) ?? '(no message)',
      short: false,
    }));

  if (commitCount > 5) {
    fields.push({
      title: '',
      value: `_…and ${commitCount - 5} more commit(s)_`,
      short: false,
    });
  }

  const attachment: MessageAttachment = {
    color: '#24292e',
    title: `[${repoName}] ${pusherName} pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to \`${branch}\``,
    titleLink: payload.compare ?? repository?.html_url,
    fields,
    footer: 'GitHub',
    ts: Math.floor(Date.now() / 1000),
    authorName: pusherName,
    authorLink: `https://github.com/${pusherName}`,
  };

  return {
    text: `${pusherName} pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${branch}`,
    attachments: [attachment],
  };
}

// ─── GitHub Pull Request ──────────────────────────────────────────────────────

export function formatGitHubPR(payload: any): FormattedMessage {
  const { action, pull_request: pr, repository } = payload;
  const repoName = repository?.full_name ?? 'unknown/repo';
  const login = pr?.user?.login ?? 'unknown';

  const isMerged = action === 'closed' && pr?.merged;

  const colorMap: Record<string, string> = {
    opened: '#2cbe4e',
    reopened: '#2cbe4e',
    ready_for_review: '#2cbe4e',
    closed: isMerged ? '#6f42c1' : '#cb2431',
    synchronize: '#f9c513',
    review_requested: '#0366d6',
    converted_to_draft: '#959da5',
  };

  const actionLabel = isMerged ? 'merged' : action ?? 'updated';

  const fields: MessageAttachment['fields'] = [
    {
      title: 'Branch',
      value: `\`${pr?.head?.ref ?? 'unknown'}\` ← \`${pr?.base?.ref ?? 'unknown'}\``,
      short: true,
    },
    {
      title: 'State',
      value: isMerged ? 'Merged' : (pr?.state ?? 'unknown'),
      short: true,
    },
  ];

  if (pr?.additions !== undefined) {
    fields.push({ title: 'Changes', value: `+${pr.additions} / -${pr.deletions ?? 0}`, short: true });
  }
  if (pr?.changed_files !== undefined) {
    fields.push({ title: 'Files changed', value: String(pr.changed_files), short: true });
  }
  if (pr?.requested_reviewers?.length) {
    fields.push({
      title: 'Reviewers',
      value: pr.requested_reviewers.map((r: any) => r.login).join(', '),
      short: false,
    });
  }

  const attachment: MessageAttachment = {
    color: colorMap[action ?? ''] ?? '#e1e4e8',
    title: `[${repoName}] PR #${pr?.number ?? '?'} ${actionLabel}: ${pr?.title ?? '(untitled)'}`,
    titleLink: pr?.html_url,
    text: pr?.body ? pr.body.slice(0, 300) + (pr.body.length > 300 ? '…' : '') : undefined,
    fields,
    footer: 'GitHub',
    ts: Math.floor(Date.now() / 1000),
    authorName: login,
    authorLink: pr?.user?.html_url,
  };

  return {
    text: `[${repoName}] PR #${pr?.number ?? '?'} ${actionLabel} by ${login}`,
    attachments: [attachment],
  };
}

// ─── GitHub Issue ─────────────────────────────────────────────────────────────

export function formatGitHubIssue(payload: any): FormattedMessage {
  const { action, issue, repository, sender } = payload;
  const repoName = repository?.full_name ?? 'unknown/repo';
  const login = sender?.login ?? issue?.user?.login ?? 'unknown';

  const colorMap: Record<string, string> = {
    opened: '#2cbe4e',
    closed: '#cb2431',
    reopened: '#f9c513',
    assigned: '#0366d6',
    unassigned: '#959da5',
    labeled: '#0366d6',
    unlabeled: '#959da5',
    edited: '#f9c513',
  };

  const labelTags = issue?.labels?.length
    ? issue.labels.map((l: any) => `\`${l.name}\``).join(' ')
    : null;

  const fields: MessageAttachment['fields'] = [
    {
      title: 'State',
      value: issue?.state
        ? issue.state.charAt(0).toUpperCase() + issue.state.slice(1)
        : 'Open',
      short: true,
    },
    {
      title: 'Assignee',
      value: issue?.assignees?.length
        ? issue.assignees.map((a: any) => a.login).join(', ')
        : 'Unassigned',
      short: true,
    },
  ];

  if (labelTags) {
    fields.push({ title: 'Labels', value: labelTags, short: false });
  }
  if (issue?.milestone) {
    fields.push({ title: 'Milestone', value: issue.milestone.title, short: true });
  }

  const attachment: MessageAttachment = {
    color: colorMap[action ?? ''] ?? '#e1e4e8',
    title: `[${repoName}] Issue #${issue?.number ?? '?'} ${action ?? 'updated'}: ${issue?.title ?? '(untitled)'}`,
    titleLink: issue?.html_url,
    text: issue?.body ? issue.body.slice(0, 300) + (issue.body.length > 300 ? '…' : '') : undefined,
    fields,
    footer: 'GitHub',
    ts: issue?.updated_at
      ? Math.floor(new Date(issue.updated_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    authorName: login,
    authorLink: sender?.html_url ?? issue?.user?.html_url,
  };

  return {
    text: `[${repoName}] Issue #${issue?.number ?? '?'} ${action ?? 'updated'} by ${login}`,
    attachments: [attachment],
  };
}

// ─── Jira Issue ───────────────────────────────────────────────────────────────

export function formatJiraIssue(payload: any): FormattedMessage {
  const { issue, user: actor, changelog, webhookEvent, baseUrl } = payload;
  const fields = issue?.fields ?? {};
  const jiraBaseUrl = baseUrl ?? '';
  const key = issue?.key ?? 'PROJ-?';
  const actorName = actor?.displayName ?? fields?.reporter?.displayName ?? 'Someone';

  const priorityColors: Record<string, string> = {
    Highest: '#d04437',
    High: '#e14d2a',
    Medium: '#f6c342',
    Low: '#707070',
    Lowest: '#999999',
  };

  const eventLabel: Record<string, string> = {
    'jira:issue_created': 'created',
    'jira:issue_updated': 'updated',
    'jira:issue_deleted': 'deleted',
    comment_created: 'commented on',
    comment_updated: 'updated a comment on',
  };

  const changedFields = changelog?.items
    ?.map(
      (item: any) =>
        `${item.field}: \`${item.fromString ?? 'none'}\` → \`${item.toString ?? 'none'}\``
    )
    .join('\n');

  const attachmentFields: MessageAttachment['fields'] = [
    { title: 'Type', value: fields.issuetype?.name ?? 'Task', short: true },
    { title: 'Priority', value: fields.priority?.name ?? 'Medium', short: true },
    { title: 'Status', value: fields.status?.name ?? 'Open', short: true },
    { title: 'Assignee', value: fields.assignee?.displayName ?? 'Unassigned', short: true },
    { title: 'Reporter', value: fields.reporter?.displayName ?? 'Unknown', short: true },
  ];

  if (fields.fixVersions?.length) {
    attachmentFields.push({
      title: 'Fix Version',
      value: fields.fixVersions.map((v: any) => v.name).join(', '),
      short: true,
    });
  }
  if (fields.labels?.length) {
    attachmentFields.push({ title: 'Labels', value: fields.labels.join(', '), short: false });
  }

  const actionText = eventLabel[webhookEvent ?? ''] ?? 'updated';

  const attachment: MessageAttachment = {
    color: priorityColors[fields.priority?.name ?? ''] ?? '#0052cc',
    title: `[${key}] ${fields.summary ?? '(no summary)'}`,
    titleLink: jiraBaseUrl ? `${jiraBaseUrl}/browse/${key}` : undefined,
    text: changedFields || (fields.description ? String(fields.description).slice(0, 300) : undefined),
    fields: attachmentFields,
    footer: 'Jira',
    ts: Math.floor(Date.now() / 1000),
    authorName: actorName,
  };

  return {
    text: `${actorName} ${actionText} ${key}`,
    attachments: [attachment],
  };
}

// ─── PagerDuty Incident ───────────────────────────────────────────────────────

export function formatPagerDutyIncident(payload: any): FormattedMessage {
  // Handle both direct incident payload and PagerDuty webhook envelope formats
  const incident = payload.incident ?? payload.messages?.[0]?.incident ?? payload;
  const rawStatus: string =
    payload.status ??
    payload.messages?.[0]?.type?.split('.')?.[1] ??
    incident.status ??
    'triggered';

  const colorMap: Record<string, string> = {
    triggered: '#e63b3b',
    acknowledged: '#f7a800',
    resolved: '#2eb886',
    assigned: '#f7a800',
  };

  const iconMap: Record<string, string> = {
    triggered: '🚨',
    acknowledged: '👀',
    resolved: '✅',
    assigned: '👤',
  };

  const statusLabel = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
  const incidentTitle = incident.title ?? incident.summary ?? 'PagerDuty Incident';
  const incidentNumber = incident.incident_number ?? incident.number ?? '?';

  const fields: MessageAttachment['fields'] = [
    { title: 'Status', value: statusLabel, short: true },
    { title: 'Urgency', value: incident.urgency === 'high' ? 'High' : 'Low', short: true },
    {
      title: 'Service',
      value: incident.service?.summary ?? incident.service?.name ?? 'Unknown',
      short: true,
    },
    {
      title: 'Assigned to',
      value:
        incident.assignments?.map((a: any) => a.assignee?.summary ?? a.assignee?.name).join(', ') ??
        incident.assigned_to_user?.summary ??
        'Nobody',
      short: true,
    },
  ];

  if (incident.escalation_policy) {
    fields.push({
      title: 'Escalation Policy',
      value: incident.escalation_policy.summary ?? incident.escalation_policy.name ?? '',
      short: true,
    });
  }
  if (incident.created_at) {
    fields.push({
      title: 'Created',
      value: new Date(incident.created_at).toLocaleString(),
      short: true,
    });
  }

  const attachment: MessageAttachment = {
    color: colorMap[rawStatus] ?? '#e63b3b',
    title: `${iconMap[rawStatus] ?? '🔔'} [#${incidentNumber}] ${incidentTitle}`,
    titleLink: incident.html_url,
    fields,
    footer: 'PagerDuty',
    ts: incident.created_at
      ? Math.floor(new Date(incident.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
  };

  return {
    text: `Incident: ${incidentTitle} ${rawStatus}`,
    attachments: [attachment],
  };
}

// ─── Stripe Event ─────────────────────────────────────────────────────────────

export function formatStripeEvent(payload: any): FormattedMessage {
  const colorMap: Record<string, string> = {
    'payment_intent.succeeded': '#2eb886',
    'payment_intent.payment_failed': '#e63b3b',
    'payment_intent.created': '#36c5f0',
    'payment_intent.canceled': '#959da5',
    'charge.succeeded': '#2eb886',
    'charge.failed': '#e63b3b',
    'charge.refunded': '#f7a800',
    'customer.subscription.created': '#36c5f0',
    'customer.subscription.updated': '#f7a800',
    'customer.subscription.deleted': '#e63b3b',
    'invoice.payment_succeeded': '#2eb886',
    'invoice.payment_failed': '#e63b3b',
    'customer.created': '#36c5f0',
    'customer.deleted': '#e63b3b',
  };

  const color = colorMap[payload.type] ?? '#6772e5';
  const obj = payload.data?.object;

  const formatAmount = (amount: number, currency: string): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency ?? 'usd').toUpperCase(),
    }).format(amount / 100);

  const isSucceeded =
    payload.type?.includes('succeeded') || payload.type?.includes('created');
  const isFailed =
    payload.type?.includes('failed') || payload.type?.includes('deleted');

  const fields: MessageAttachment['fields'] = [
    { title: 'Event', value: `\`${payload.type}\``, short: true },
    { title: 'ID', value: `\`${obj?.id ?? payload.id ?? 'unknown'}\``, short: true },
  ];

  // Amount
  const amount = obj?.amount ?? obj?.amount_due ?? obj?.amount_paid;
  const currency = obj?.currency ?? 'usd';
  if (amount !== undefined) {
    fields.push({
      title: obj?.amount_due !== undefined ? 'Amount Due' : 'Amount',
      value: formatAmount(amount, currency),
      short: true,
    });
  }

  // Customer
  if (obj?.customer) {
    fields.push({ title: 'Customer', value: `\`${obj.customer}\``, short: true });
  }

  // Description / statement descriptor
  if (obj?.description) {
    fields.push({ title: 'Description', value: obj.description, short: false });
  } else if (obj?.statement_descriptor) {
    fields.push({ title: 'Description', value: obj.statement_descriptor, short: false });
  }

  // Status
  if (obj?.status) {
    fields.push({
      title: 'Status',
      value: obj.status.charAt(0).toUpperCase() + obj.status.slice(1),
      short: true,
    });
  }

  // Plan / subscription info
  const plan = obj?.plan ?? obj?.items?.data?.[0]?.plan;
  if (plan) {
    fields.push({ title: 'Plan', value: plan.nickname ?? plan.id ?? 'unknown', short: true });
  }

  const humanEventType = payload.type
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const attachment: MessageAttachment = {
    color,
    title: `Stripe: ${humanEventType ?? 'Event'}`,
    titleLink: obj?.receipt_url ?? obj?.hosted_invoice_url,
    fields,
    footer: 'Stripe',
    ts: payload.created ?? Math.floor(Date.now() / 1000),
  };

  const amountText =
    amount !== undefined
      ? ` for ${formatAmount(amount, currency)}`
      : '';
  const customerText = obj?.customer ? ` from ${obj.customer}` : '';
  const outcomeText = isSucceeded ? 'succeeded' : isFailed ? 'failed' : 'updated';

  return {
    text: `Payment ${outcomeText}${amountText}${customerText}`,
    attachments: [attachment],
  };
}
