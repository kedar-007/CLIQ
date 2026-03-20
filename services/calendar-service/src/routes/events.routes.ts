import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  expandRecurring,
  checkConflicts,
  rsvp,
} from '../services/calendar.service';
import { prisma } from '@comms/db';

const logger = createLogger('calendar-service:events');
export const eventsRouter = Router();

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

eventsRouter.use(auth);

// ─── Schemas ──────────────────────────────────────────────────────────────────
const createEventSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().default('UTC'),
  rrule: z.string().optional(),               // RFC 5545 RRULE string
  attendeeIds: z.array(z.string()).default([]),
  channelId: z.string().optional(),
  meetingLink: z.string().url().optional(),
  location: z.string().optional(),
  isAllDay: z.boolean().default(false),
  color: z.string().optional(),
});

const updateEventSchema = createEventSchema.partial().extend({
  scope: z.enum(['THIS', 'THIS_AND_FOLLOWING', 'ALL']).default('THIS'),
});

const rsvpSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
  comment: z.string().optional(),
});

// ─── GET /events ──────────────────────────────────────────────────────────────
eventsRouter.get('/', async (req: any, res: Response) => {
  try {
    const { start, end, channelId, userId } = req.query;

    if (!start || !end) {
      res.status(400).json({ success: false, error: 'start and end query params required' });
      return;
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    const where: any = {
      tenantId: req.user.tenantId,
      deletedAt: null,
      OR: [
        { start: { gte: startDate, lte: endDate } },
        { end: { gte: startDate, lte: endDate } },
        { AND: [{ start: { lte: startDate } }, { end: { gte: endDate } }] },
      ],
    };

    if (channelId) where.channelId = channelId;

    if (userId) {
      where.attendees = { some: { userId } };
    }

    const events = await (prisma as any).calendarEvent.findMany({
      where,
      include: {
        attendees: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
        },
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { start: 'asc' },
    });

    // Expand recurring events
    const expandedEvents: unknown[] = [];
    for (const event of events) {
      if (event.rrule) {
        const instances = expandRecurring(event, startDate, endDate);
        expandedEvents.push(...instances);
      } else {
        expandedEvents.push(event);
      }
    }

    res.json({ success: true, data: expandedEvents, count: expandedEvents.length });
  } catch (err) {
    logger.error('List events error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── POST /events ─────────────────────────────────────────────────────────────
eventsRouter.post('/', async (req: any, res: Response) => {
  try {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const event = await createEvent(
      { ...parsed.data, createdBy: req.user.sub },
      req.user.tenantId
    );

    res.status(201).json({ success: true, data: event });
  } catch (err) {
    logger.error('Create event error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /events/my-events ────────────────────────────────────────────────────
eventsRouter.get('/my-events', async (req: any, res: Response) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      res.status(400).json({ success: false, error: 'start and end query params required' });
      return;
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    const events = await (prisma as any).calendarEvent.findMany({
      where: {
        tenantId: req.user.tenantId,
        deletedAt: null,
        attendees: { some: { userId: req.user.sub } },
        OR: [
          { start: { gte: startDate, lte: endDate } },
          { end: { gte: startDate, lte: endDate } },
        ],
      },
      include: {
        attendees: {
          where: { userId: req.user.sub },
          select: { status: true },
        },
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { start: 'asc' },
    });

    res.json({ success: true, data: events });
  } catch (err) {
    logger.error('My events error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /events/:id ──────────────────────────────────────────────────────────
eventsRouter.get('/:id', async (req: any, res: Response) => {
  try {
    const event = await (prisma as any).calendarEvent.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null },
      include: {
        attendees: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
        },
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    res.json({ success: true, data: event });
  } catch (err) {
    logger.error('Get event error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── PUT /events/:id ──────────────────────────────────────────────────────────
eventsRouter.put('/:id', async (req: any, res: Response) => {
  try {
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const { scope, ...data } = parsed.data;

    const event = await updateEvent(req.params.id, data, scope || 'THIS', req.user.tenantId);
    res.json({ success: true, data: event });
  } catch (err: any) {
    if (err.message === 'Event not found') {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    logger.error('Update event error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── DELETE /events/:id ───────────────────────────────────────────────────────
eventsRouter.delete('/:id', async (req: any, res: Response) => {
  try {
    const scope = (req.query.scope as 'THIS' | 'THIS_AND_FOLLOWING' | 'ALL') || 'THIS';
    await deleteEvent(req.params.id, scope, req.user.tenantId);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Event not found') {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    logger.error('Delete event error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── POST /events/:id/rsvp ────────────────────────────────────────────────────
eventsRouter.post('/:id/rsvp', async (req: any, res: Response) => {
  try {
    const parsed = rsvpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const attendee = await rsvp(req.params.id, req.user.sub, parsed.data.status);
    res.json({ success: true, data: attendee });
  } catch (err: any) {
    if (err.message === 'Not invited to this event') {
      res.status(403).json({ success: false, error: 'Not invited to this event' });
      return;
    }
    logger.error('RSVP error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /events/:id/attendees ────────────────────────────────────────────────
eventsRouter.get('/:id/attendees', async (req: any, res: Response) => {
  try {
    const event = await (prisma as any).calendarEvent.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const attendees = await (prisma as any).calendarAttendee.findMany({
      where: { eventId: req.params.id },
      include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: attendees });
  } catch (err) {
    logger.error('Get attendees error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── POST /events/:id/invite ──────────────────────────────────────────────────
eventsRouter.post('/:id/invite', async (req: any, res: Response) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ success: false, error: 'userIds array required' });
      return;
    }

    const event = await (prisma as any).calendarEvent.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    // Only creator/organizer can invite
    if (event.createdBy !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Only the organizer can invite attendees' });
      return;
    }

    const newAttendees = await Promise.all(
      userIds.map((userId: string) =>
        (prisma as any).calendarAttendee.upsert({
          where: { eventId_userId: { eventId: req.params.id, userId } },
          create: { eventId: req.params.id, userId, status: 'PENDING' },
          update: {},
        })
      )
    );

    res.json({ success: true, data: newAttendees });
  } catch (err) {
    logger.error('Invite attendees error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});
