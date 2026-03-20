import { google } from 'googleapis';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { encryptToken } from './calendar.service';

const logger = createLogger('calendar-service:google-calendar');

const CALENDAR_SERVICE_URL = process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007';

function buildOAuth2Client(accessToken: string): ReturnType<typeof google.auth.OAuth2.prototype.setCredentials> & any {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${CALENDAR_SERVICE_URL}/sync/google/callback`
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

// ─── Sync from Google → local DB ─────────────────────────────────────────────

export async function syncFromGoogle(
  userId: string,
  accessToken: string,
  tenantId: string
): Promise<number> {
  const auth = buildOAuth2Client(accessToken);
  const calendar = google.calendar({ version: 'v3', auth });

  // Fetch events from the last 30 days to next 90 days
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 90);

  let pageToken: string | undefined;
  let syncedCount = 0;

  do {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 250,
      singleEvents: false,
      pageToken,
    });

    const items = response.data.items || [];
    pageToken = response.data.nextPageToken || undefined;

    for (const item of items) {
      if (!item.start || item.status === 'cancelled') continue;

      try {
        const startDate = item.start.dateTime
          ? new Date(item.start.dateTime)
          : new Date(item.start.date + 'T00:00:00Z');
        const endDate = item.end?.dateTime
          ? new Date(item.end.dateTime)
          : item.end?.date
          ? new Date(item.end.date + 'T23:59:59Z')
          : startDate;

        await (prisma as any).calendarEvent.upsert({
          where: { externalId_provider: { externalId: item.id!, provider: 'google' } },
          create: {
            tenantId,
            title: item.summary || '(No title)',
            description: item.description,
            start: startDate,
            end: endDate,
            timezone: item.start.timeZone || 'UTC',
            rrule: item.recurrence?.[0]?.replace(/^RRULE:/, '') || null,
            meetingLink: item.hangoutLink || extractConferenceLink(item),
            location: item.location,
            isAllDay: !!item.start.date,
            createdBy: userId,
            externalId: item.id!,
            provider: 'google',
            externalUpdatedAt: item.updated ? new Date(item.updated) : null,
          },
          update: {
            title: item.summary || '(No title)',
            description: item.description,
            start: startDate,
            end: endDate,
            timezone: item.start.timeZone || 'UTC',
            rrule: item.recurrence?.[0]?.replace(/^RRULE:/, '') || null,
            meetingLink: item.hangoutLink || extractConferenceLink(item),
            location: item.location,
            isAllDay: !!item.start.date,
            externalUpdatedAt: item.updated ? new Date(item.updated) : null,
          },
        });
        syncedCount++;
      } catch (err) {
        logger.warn('Failed to upsert Google event', { eventId: item.id, err });
      }
    }
  } while (pageToken);

  logger.info('Google Calendar sync complete', { userId, syncedCount });
  return syncedCount;
}

// ─── Push local event → Google Calendar ──────────────────────────────────────

export async function syncToGoogle(
  event: {
    id: string;
    title: string;
    description?: string | null;
    start: Date;
    end: Date;
    timezone?: string;
    rrule?: string | null;
    location?: string | null;
    meetingLink?: string | null;
    isAllDay?: boolean;
  },
  accessToken: string
): Promise<string> {
  const auth = buildOAuth2Client(accessToken);
  const calendar = google.calendar({ version: 'v3', auth });

  const eventBody: any = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.isAllDay
      ? { date: event.start.toISOString().split('T')[0] }
      : { dateTime: event.start.toISOString(), timeZone: event.timezone || 'UTC' },
    end: event.isAllDay
      ? { date: event.end.toISOString().split('T')[0] }
      : { dateTime: event.end.toISOString(), timeZone: event.timezone || 'UTC' },
  };

  if (event.rrule) {
    eventBody.recurrence = [event.rrule.startsWith('RRULE:') ? event.rrule : `RRULE:${event.rrule}`];
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventBody,
  });

  logger.info('Event pushed to Google Calendar', { localEventId: event.id, googleEventId: response.data.id });
  return response.data.id!;
}

// ─── Watch calendar for push notifications ────────────────────────────────────

export async function watchCalendar(
  userId: string,
  accessToken: string
): Promise<{ channelId: string; resourceId: string; expiration: string }> {
  const auth = buildOAuth2Client(accessToken);
  const calendar = google.calendar({ version: 'v3', auth });

  const channelId = `cal-watch-${userId}-${Date.now()}`;
  const webhookUrl = `${CALENDAR_SERVICE_URL}/sync/google/webhook`;

  const response = await calendar.events.watch({
    calendarId: 'primary',
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN || 'google-cal-token',
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  const result = {
    channelId: response.data.id || channelId,
    resourceId: response.data.resourceId || '',
    expiration: response.data.expiration || '',
  };

  // Store watch info for renewal
  await (prisma as any).calendarWatch.upsert({
    where: { userId_provider: { userId, provider: 'google' } },
    create: {
      userId,
      provider: 'google',
      channelId: result.channelId,
      resourceId: result.resourceId,
      expiresAt: result.expiration ? new Date(parseInt(result.expiration)) : null,
    },
    update: {
      channelId: result.channelId,
      resourceId: result.resourceId,
      expiresAt: result.expiration ? new Date(parseInt(result.expiration)) : null,
    },
  });

  logger.info('Google Calendar watch set up', { userId, channelId: result.channelId });
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractConferenceLink(event: any): string | null {
  const entryPoints = event.conferenceData?.entryPoints;
  if (!entryPoints) return null;
  const videoEntry = entryPoints.find((e: any) => e.entryPointType === 'video');
  return videoEntry?.uri || null;
}
