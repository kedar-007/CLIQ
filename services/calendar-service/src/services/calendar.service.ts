import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import { addMinutes } from 'date-fns';
import axios from 'axios';
import crypto from 'crypto';

const logger = createLogger('calendar-service:calendar-service');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

// ─── Token helpers (shared with sync routes) ──────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const ENC_KEY = Buffer.from(
  (process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64)).slice(0, 64),
  'hex'
);

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENC_KEY, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptToken(encryptedStr: string): string {
  const [ivB64, tagB64, encB64] = encryptedStr.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENC_KEY, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecurrenceScope = 'THIS' | 'THIS_AND_FOLLOWING' | 'ALL';
export type RSVPStatus = 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'PENDING';

export interface CreateEventData {
  title: string;
  description?: string;
  start: string;
  end: string;
  timezone?: string;
  rrule?: string;
  attendeeIds?: string[];
  channelId?: string;
  meetingLink?: string;
  location?: string;
  isAllDay?: boolean;
  color?: string;
  createdBy: string;
}

// ─── Create event ─────────────────────────────────────────────────────────────

export async function createEvent(data: CreateEventData, tenantId: string): Promise<unknown> {
  const startDate = new Date(data.start);
  const endDate = new Date(data.end);

  if (startDate >= endDate) {
    throw new Error('start must be before end');
  }

  const event = await (prisma as any).calendarEvent.create({
    data: {
      tenantId,
      title: data.title,
      description: data.description,
      start: startDate,
      end: endDate,
      timezone: data.timezone || 'UTC',
      rrule: data.rrule,
      channelId: data.channelId,
      meetingLink: data.meetingLink,
      location: data.location,
      isAllDay: data.isAllDay || false,
      color: data.color,
      createdBy: data.createdBy,
    },
  });

  // Create attendees
  const attendeeIds = [...new Set([data.createdBy, ...(data.attendeeIds || [])])];
  await Promise.all(
    attendeeIds.map((userId) =>
      (prisma as any).calendarAttendee.create({
        data: {
          eventId: event.id,
          userId,
          status: userId === data.createdBy ? 'ACCEPTED' : 'PENDING',
          isOrganizer: userId === data.createdBy,
        },
      })
    )
  );

  // Send notifications to attendees (excluding creator)
  const invitees = (data.attendeeIds || []).filter((id) => id !== data.createdBy);
  if (invitees.length > 0) {
    try {
      await axios.post(
        `${NOTIFICATION_SERVICE_URL}/notifications/bulk`,
        {
          userIds: invitees,
          tenantId,
          type: 'CALENDAR_INVITE',
          title: `📅 You've been invited: ${data.title}`,
          body: `${new Date(data.start).toLocaleString()} – ${data.meetingLink ? 'Join link available' : data.location || 'No location set'}`,
          data: { eventId: event.id },
        },
        { headers: { 'x-service-secret': SERVICE_SECRET } }
      );
    } catch (err) {
      logger.warn('Failed to send calendar invite notifications', { err });
    }
  }

  logger.info('Event created', { eventId: event.id, tenantId });
  return event;
}

// ─── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(
  id: string,
  data: Partial<CreateEventData>,
  scope: RecurrenceScope,
  tenantId: string
): Promise<unknown> {
  const event = await (prisma as any).calendarEvent.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!event) throw new Error('Event not found');

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.start !== undefined) updateData.start = new Date(data.start);
  if (data.end !== undefined) updateData.end = new Date(data.end);
  if (data.timezone !== undefined) updateData.timezone = data.timezone;
  if (data.meetingLink !== undefined) updateData.meetingLink = data.meetingLink;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.isAllDay !== undefined) updateData.isAllDay = data.isAllDay;
  if (data.color !== undefined) updateData.color = data.color;

  if (!event.rrule || scope === 'ALL') {
    // Update this single event or all instances
    if (data.rrule !== undefined) updateData.rrule = data.rrule;
    const updated = await (prisma as any).calendarEvent.update({
      where: { id },
      data: { ...updateData, updatedAt: new Date() },
    });
    return updated;
  }

  if (scope === 'THIS') {
    // Add exception date to parent, create a detached override event
    const exDate = event.start.toISOString().split('T')[0];
    const existingExDates: string[] = event.exDates || [];
    existingExDates.push(exDate);

    await (prisma as any).calendarEvent.update({
      where: { id },
      data: { exDates: existingExDates },
    });

    // Create override event
    const override = await (prisma as any).calendarEvent.create({
      data: {
        ...updateData,
        tenantId,
        title: updateData.title as string || event.title,
        start: updateData.start as Date || event.start,
        end: updateData.end as Date || event.end,
        timezone: updateData.timezone as string || event.timezone,
        createdBy: event.createdBy,
        parentEventId: id,
        isRecurrenceOverride: true,
      },
    });
    return override;
  }

  if (scope === 'THIS_AND_FOLLOWING') {
    // Truncate original RRULE's UNTIL to day before this occurrence,
    // then create a new series starting from this occurrence.
    const cutoffDate = event.start;
    const rruleStr: string = event.rrule;

    // Modify RRULE to end before this occurrence
    let modifiedRRule = rruleStr;
    if (!rruleStr.includes('UNTIL') && !rruleStr.includes('COUNT')) {
      const until = new Date(cutoffDate.getTime() - 86400000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      modifiedRRule = `${rruleStr};UNTIL=${until}`;
    }

    await (prisma as any).calendarEvent.update({
      where: { id },
      data: { rrule: modifiedRRule },
    });

    // Create new series
    const newSeries = await (prisma as any).calendarEvent.create({
      data: {
        ...updateData,
        tenantId,
        title: updateData.title as string || event.title,
        description: updateData.description as string || event.description,
        start: updateData.start as Date || event.start,
        end: updateData.end as Date || event.end,
        timezone: updateData.timezone as string || event.timezone,
        rrule: data.rrule || event.rrule,
        channelId: event.channelId,
        meetingLink: updateData.meetingLink as string || event.meetingLink,
        createdBy: event.createdBy,
        parentEventId: id,
      },
    });
    return newSeries;
  }

  return event;
}

// ─── Delete event ─────────────────────────────────────────────────────────────

export async function deleteEvent(
  id: string,
  scope: RecurrenceScope,
  tenantId: string
): Promise<void> {
  const event = await (prisma as any).calendarEvent.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!event) throw new Error('Event not found');

  if (!event.rrule || scope === 'ALL') {
    await (prisma as any).calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return;
  }

  if (scope === 'THIS') {
    // Add exception date
    const exDate = event.start.toISOString().split('T')[0];
    const existingExDates: string[] = event.exDates || [];
    existingExDates.push(exDate);
    await (prisma as any).calendarEvent.update({
      where: { id },
      data: { exDates: existingExDates },
    });
    return;
  }

  if (scope === 'THIS_AND_FOLLOWING') {
    const cutoffDate = event.start;
    const rruleStr: string = event.rrule;
    const until = new Date(cutoffDate.getTime() - 86400000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    let modifiedRRule = rruleStr;
    if (!rruleStr.includes('UNTIL') && !rruleStr.includes('COUNT')) {
      modifiedRRule = `${rruleStr};UNTIL=${until}`;
    }
    await (prisma as any).calendarEvent.update({
      where: { id },
      data: { rrule: modifiedRRule },
    });
  }
}

// ─── Expand recurring events ──────────────────────────────────────────────────

export function expandRecurring(
  event: any,
  rangeStart: Date,
  rangeEnd: Date
): unknown[] {
  if (!event.rrule) return [event];

  try {
    const rruleStr = event.rrule.startsWith('RRULE:')
      ? `DTSTART:${event.start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${event.rrule}`
      : `DTSTART:${event.start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:${event.rrule}`;

    const rule = rrulestr(rruleStr);
    const occurrences = rule.between(rangeStart, rangeEnd, true);
    const exDates: string[] = event.exDates || [];

    const eventDuration = event.end.getTime() - event.start.getTime();

    return occurrences
      .filter((occ) => !exDates.includes(occ.toISOString().split('T')[0]))
      .map((occ) => ({
        ...event,
        id: `${event.id}_${occ.getTime()}`,
        parentId: event.id,
        start: occ,
        end: new Date(occ.getTime() + eventDuration),
        isRecurringInstance: true,
      }));
  } catch (err) {
    logger.warn('Failed to expand recurring event', { eventId: event.id, err });
    return [event];
  }
}

// ─── Check scheduling conflicts ───────────────────────────────────────────────

export async function checkConflicts(
  userId: string,
  start: Date,
  end: Date,
  excludeEventId?: string
): Promise<boolean> {
  const conflicts = await (prisma as any).calendarAttendee.findFirst({
    where: {
      userId,
      status: { in: ['ACCEPTED', 'TENTATIVE'] },
      event: {
        deletedAt: null,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        OR: [
          { start: { gte: start, lt: end } },
          { end: { gt: start, lte: end } },
          { AND: [{ start: { lte: start } }, { end: { gte: end } }] },
        ],
      },
    },
  });

  return !!conflicts;
}

// ─── RSVP ─────────────────────────────────────────────────────────────────────

export async function rsvp(
  eventId: string,
  userId: string,
  status: RSVPStatus
): Promise<unknown> {
  const attendee = await (prisma as any).calendarAttendee.findFirst({
    where: { eventId, userId },
  });

  if (!attendee) {
    throw new Error('Not invited to this event');
  }

  const updated = await (prisma as any).calendarAttendee.update({
    where: { id: attendee.id },
    data: { status, respondedAt: new Date() },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });

  logger.info('RSVP updated', { eventId, userId, status });
  return updated;
}
