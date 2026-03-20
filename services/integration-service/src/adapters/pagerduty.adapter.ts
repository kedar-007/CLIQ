import axios from 'axios';
import { createLogger } from '@comms/logger';

const logger = createLogger('integration-service:pagerduty');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

const URGENCY_EMOJI: Record<string, string> = {
  high: '🔴',
  low: '🟡',
};

// ─── Incident created ─────────────────────────────────────────────────────────

export async function handleIncidentCreated(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const incident = extractIncident(payload);
  if (!incident) return;

  const urgencyIcon = URGENCY_EMOJI[incident.urgency] || '🟠';

  const content = [
    `🚨 ${urgencyIcon} *PagerDuty Incident Triggered!*`,
    `*[${incident.number}] ${incident.title}*`,
    `Service: ${incident.serviceName}`,
    incident.assignedTo ? `Assigned to: ${incident.assignedTo}` : '',
    `[View Incident](${incident.url})`,
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'pagerduty.incident_created',
    incidentId: incident.id,
    incidentNumber: incident.number,
  });
}

// ─── Incident acknowledged ────────────────────────────────────────────────────

export async function handleIncidentAcknowledged(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const incident = extractIncident(payload);
  if (!incident) return;

  const acknowledgedBy = payload.log_entries?.[0]?.agent?.summary
    || payload.messages?.[0]?.agent?.summary
    || 'someone';

  const content = [
    `👀 *PagerDuty Incident Acknowledged*`,
    `*[${incident.number}] ${incident.title}*`,
    `Acknowledged by: ${acknowledgedBy}`,
    `[View Incident](${incident.url})`,
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'pagerduty.incident_acknowledged',
    incidentId: incident.id,
  });
}

// ─── Incident resolved ────────────────────────────────────────────────────────

export async function handleIncidentResolved(
  payload: any,
  channelId: string,
  tenantId: string
): Promise<void> {
  const incident = extractIncident(payload);
  if (!incident) return;

  const resolvedBy = payload.log_entries?.[0]?.agent?.summary
    || payload.messages?.[0]?.agent?.summary
    || 'someone';

  // Calculate duration if timestamps available
  let duration = '';
  if (incident.createdAt) {
    const created = new Date(incident.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
      duration = ` · Duration: ${diffMins}m`;
    } else {
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      duration = ` · Duration: ${hrs}h ${mins}m`;
    }
  }

  const content = [
    `✅ *PagerDuty Incident Resolved*${duration}`,
    `*[${incident.number}] ${incident.title}*`,
    `Resolved by: ${resolvedBy}`,
    `[View Incident](${incident.url})`,
  ].filter(Boolean).join('\n');

  await postToChannel(channelId, tenantId, content, {
    type: 'pagerduty.incident_resolved',
    incidentId: incident.id,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface IncidentInfo {
  id: string;
  number: number;
  title: string;
  urgency: string;
  serviceName: string;
  assignedTo: string | null;
  url: string;
  createdAt: string | null;
}

function extractIncident(payload: any): IncidentInfo | null {
  // PagerDuty v2 webhooks have different structures
  const incident = payload.incident || payload.data?.incident || payload.payload?.incident;
  if (!incident) return null;

  return {
    id: incident.id || '',
    number: incident.incident_number || incident.number || 0,
    title: incident.title || incident.summary || 'Unknown incident',
    urgency: incident.urgency || 'high',
    serviceName: incident.service?.summary || incident.service?.name || 'Unknown service',
    assignedTo: incident.assignments?.[0]?.assignee?.summary || null,
    url: incident.html_url || incident.url || '',
    createdAt: incident.created_at || incident.createdAt || null,
  };
}

async function postToChannel(
  channelId: string,
  tenantId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await axios.post(
      `${CHAT_SERVICE_URL}/messages`,
      { channelId, tenantId, content, isBot: true, botName: 'PagerDuty', metadata },
      { headers: { 'x-service-secret': SERVICE_SECRET }, timeout: 8000 }
    );
  } catch (err) {
    logger.error('Failed to post PagerDuty event to channel', { err, channelId });
  }
}
