import { createLogger } from '@comms/logger';
import { prisma } from '@comms/db';
import axios from 'axios';

const logger = createLogger('microsoft-calendar');

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const PROVIDER = 'microsoft';

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function getMicrosoftAuthUrl(state: string): string {
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/api/v1/sync/microsoft/callback`,
    scope: 'openid email profile offline_access Calendars.ReadWrite User.Read',
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/api/v1/sync/microsoft/callback`,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: new Date(Date.now() + res.data.expires_in * 1000),
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Calendars.ReadWrite User.Read offline_access',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + res.data.expires_in * 1000),
  };
}

// ─── Sync FROM Microsoft → local DB ──────────────────────────────────────────

export async function syncFromMicrosoft(
  userId: string,
  accessToken: string,
  tenantId: string
): Promise<number> {
  try {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let nextLink: string | null =
      `${GRAPH_API}/me/calendarView?startDateTime=${now}&endDateTime=${future}&$top=100&$select=id,subject,body,start,end,location,isAllDay,recurrence,onlineMeeting,webLink`;

    let syncedCount = 0;

    while (nextLink) {
      const res = await axios.get(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const items: any[] = res.data.value || [];
      nextLink = res.data['@odata.nextLink'] || null;

      for (const item of items) {
        if (!item.start) continue;

        const startDate = new Date(item.start.dateTime || item.start.date);
        const endDate = item.end
          ? new Date(item.end.dateTime || item.end.date)
          : new Date(startDate.getTime() + 60 * 60 * 1000);

        const timezone = item.start.timeZone || 'UTC';
        const isAllDay = !!item.isAllDay;

        // Strip HTML tags from body content
        const description = item.body?.content
          ? item.body.content.replace(/<[^>]*>/g, '').trim() || null
          : null;

        const meetingLink =
          item.onlineMeeting?.joinUrl ||
          item.webLink ||
          null;

        const location = item.location?.displayName || null;

        // Extract recurrence rule
        let rrule: string | null = null;
        if (item.recurrence?.pattern) {
          rrule = buildRruleFromMicrosoft(item.recurrence);
        }

        try {
          await (prisma as any).calendarEvent.upsert({
            where: {
              externalId_provider: { externalId: item.id, provider: PROVIDER },
            },
            update: {
              title: item.subject || '(No title)',
              description,
              start: startDate,
              end: endDate,
              timezone,
              rrule,
              meetingLink,
              location,
              isAllDay,
              externalUpdatedAt: new Date(),
              updatedAt: new Date(),
            },
            create: {
              tenantId,
              title: item.subject || '(No title)',
              description,
              start: startDate,
              end: endDate,
              timezone,
              rrule,
              meetingLink,
              location,
              isAllDay,
              createdBy: userId,
              externalId: item.id,
              provider: PROVIDER,
              externalUpdatedAt: new Date(),
            },
          });
          syncedCount++;
        } catch (err: any) {
          logger.warn('Failed to upsert Microsoft calendar event', { itemId: item.id, error: err?.message });
        }
      }
    }

    logger.info(`Synced ${syncedCount} events from Microsoft for user ${userId}`);
    return syncedCount;
  } catch (err: any) {
    logger.error('Microsoft calendar sync error', { userId, error: err?.message });
    throw err;
  }
}

// ─── Sync TO Microsoft ────────────────────────────────────────────────────────

export async function syncToMicrosoft(eventId: string, accessToken: string): Promise<void> {
  const event = await (prisma as any).calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    logger.warn(`Event ${eventId} not found, skipping syncToMicrosoft`);
    return;
  }

  const body = {
    subject: event.title,
    body: {
      contentType: 'text',
      content: event.description || '',
    },
    start: {
      dateTime: event.isAllDay
        ? event.start.toISOString().split('T')[0]
        : event.start.toISOString(),
      timeZone: event.timezone || 'UTC',
    },
    end: {
      dateTime: event.isAllDay
        ? event.end.toISOString().split('T')[0]
        : event.end.toISOString(),
      timeZone: event.timezone || 'UTC',
    },
    ...(event.location ? { location: { displayName: event.location } } : {}),
  };

  try {
    if (event.externalId && event.provider === PROVIDER) {
      // Update existing event in Microsoft
      await axios.patch(`${GRAPH_API}/me/events/${event.externalId}`, body, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      logger.info('Updated Microsoft calendar event', { eventId, externalId: event.externalId });
    } else {
      // Create new event in Microsoft
      const res = await axios.post(`${GRAPH_API}/me/events`, body, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      await (prisma as any).calendarEvent.update({
        where: { id: eventId },
        data: {
          externalId: res.data.id,
          provider: PROVIDER,
          externalUpdatedAt: new Date(),
        },
      });
      logger.info('Created Microsoft calendar event', { eventId, externalId: res.data.id });
    }
  } catch (err: any) {
    logger.error('Failed to sync event to Microsoft', { eventId, error: err?.message });
    throw err;
  }
}

// ─── Delete from Microsoft ────────────────────────────────────────────────────

export async function deleteFromMicrosoft(eventId: string, accessToken: string): Promise<void> {
  const event = await (prisma as any).calendarEvent.findUnique({ where: { id: eventId } });
  if (!event?.externalId || event.provider !== PROVIDER) return;

  try {
    await axios.delete(`${GRAPH_API}/me/events/${event.externalId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info('Deleted Microsoft calendar event', { eventId, externalId: event.externalId });
  } catch (err: any) {
    // Ignore 404 — already deleted on Microsoft side
    if (err?.response?.status !== 404) {
      logger.error('Failed to delete Microsoft event', { eventId, error: err?.message });
      throw err;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Microsoft Graph recurrence pattern to RFC 5545 RRULE string.
 * Handles the most common patterns; complex cases fall back gracefully.
 */
function buildRruleFromMicrosoft(recurrence: any): string | null {
  const { pattern, range } = recurrence;
  if (!pattern) return null;

  const parts: string[] = [];

  // Frequency
  switch (pattern.type?.toLowerCase()) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      if (pattern.daysOfWeek?.length) {
        const days = pattern.daysOfWeek.map((d: string) => d.substring(0, 2).toUpperCase()).join(',');
        parts.push(`BYDAY=${days}`);
      }
      break;
    case 'absolutemonthly':
    case 'relativeMonthly':
      parts.push('FREQ=MONTHLY');
      if (pattern.dayOfMonth) {
        parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`);
      }
      break;
    case 'absoluteyearly':
    case 'relativeyearly':
      parts.push('FREQ=YEARLY');
      break;
    default:
      return null;
  }

  if (pattern.interval && pattern.interval > 1) {
    parts.push(`INTERVAL=${pattern.interval}`);
  }

  // Range
  if (range) {
    if (range.type === 'endDate' && range.endDate) {
      const until = range.endDate.replace(/-/g, '');
      parts.push(`UNTIL=${until}T235959Z`);
    } else if (range.type === 'numbered' && range.numberOfOccurrences) {
      parts.push(`COUNT=${range.numberOfOccurrences}`);
    }
  }

  return parts.join(';');
}
