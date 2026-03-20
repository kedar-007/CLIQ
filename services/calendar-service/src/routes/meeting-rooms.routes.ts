import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';
import { addDays, startOfDay, endOfDay } from 'date-fns';

const logger = createLogger('calendar-service:meeting-rooms');
export const meetingRoomsRouter = Router();

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

meetingRoomsRouter.use(auth);

const bookRoomSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.string().datetime(),
  end: z.string().datetime(),
  bookedBy: z.string().optional(),
  attendeeCount: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

// ─── GET /meeting-rooms ───────────────────────────────────────────────────────
meetingRoomsRouter.get('/', async (req: any, res: Response) => {
  try {
    const { start, end } = req.query;

    const rooms = await (prisma as any).meetingRoom.findMany({
      where: { tenantId: req.user.tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    // If date range provided, attach availability
    if (start && end) {
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

      const roomsWithAvailability = await Promise.all(
        rooms.map(async (room: any) => {
          const bookings = await (prisma as any).roomBooking.findMany({
            where: {
              roomId: room.id,
              deletedAt: null,
              OR: [
                { start: { gte: startDate, lt: endDate } },
                { end: { gt: startDate, lte: endDate } },
                { AND: [{ start: { lte: startDate } }, { end: { gte: endDate } }] },
              ],
            },
            include: {
              bookedBy: { select: { id: true, name: true } },
            },
            orderBy: { start: 'asc' },
          });

          return { ...room, bookings, isAvailableNow: isAvailableNow(bookings) };
        })
      );

      res.json({ success: true, data: roomsWithAvailability });
      return;
    }

    res.json({ success: true, data: rooms });
  } catch (err) {
    logger.error('List meeting rooms error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── POST /meeting-rooms/:id/book ─────────────────────────────────────────────
meetingRoomsRouter.post('/:id/book', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = bookRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const room = await (prisma as any).meetingRoom.findFirst({
      where: { id, tenantId: req.user.tenantId, isActive: true },
    });

    if (!room) {
      res.status(404).json({ success: false, error: 'Meeting room not found' });
      return;
    }

    const startDate = new Date(parsed.data.start);
    const endDate = new Date(parsed.data.end);

    if (startDate >= endDate) {
      res.status(400).json({ success: false, error: 'start must be before end' });
      return;
    }

    // Conflict detection
    const conflict = await (prisma as any).roomBooking.findFirst({
      where: {
        roomId: id,
        deletedAt: null,
        OR: [
          { start: { gte: startDate, lt: endDate } },
          { end: { gt: startDate, lte: endDate } },
          { AND: [{ start: { lte: startDate } }, { end: { gte: endDate } }] },
        ],
      },
      include: { bookedBy: { select: { name: true } } },
    });

    if (conflict) {
      res.status(409).json({
        success: false,
        error: 'Room is already booked for this time',
        conflict: {
          start: conflict.start,
          end: conflict.end,
          bookedBy: conflict.bookedBy?.name,
          title: conflict.title,
        },
      });
      return;
    }

    const booking = await (prisma as any).roomBooking.create({
      data: {
        roomId: id,
        tenantId: req.user.tenantId,
        title: parsed.data.title,
        start: startDate,
        end: endDate,
        bookedById: parsed.data.bookedBy || req.user.sub,
        attendeeCount: parsed.data.attendeeCount,
        notes: parsed.data.notes,
      },
      include: {
        bookedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    logger.error('Book room error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── DELETE /meeting-rooms/:id/bookings/:bookingId ────────────────────────────
meetingRoomsRouter.delete('/:id/bookings/:bookingId', async (req: any, res: Response) => {
  try {
    const { id, bookingId } = req.params;

    const booking = await (prisma as any).roomBooking.findFirst({
      where: { id: bookingId, roomId: id, tenantId: req.user.tenantId, deletedAt: null },
    });

    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    // Only the person who booked or an admin can cancel
    if (booking.bookedById !== req.user.sub && !['ADMIN', 'OWNER'].includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Not authorized to cancel this booking' });
      return;
    }

    await (prisma as any).roomBooking.update({
      where: { id: bookingId },
      data: { deletedAt: new Date(), cancelledBy: req.user.sub },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Cancel booking error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── GET /meeting-rooms/:id/schedule ─────────────────────────────────────────
meetingRoomsRouter.get('/:id/schedule', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { weekStart } = req.query;

    const room = await (prisma as any).meetingRoom.findFirst({
      where: { id, tenantId: req.user.tenantId, isActive: true },
    });

    if (!room) {
      res.status(404).json({ success: false, error: 'Meeting room not found' });
      return;
    }

    const start = weekStart ? startOfDay(new Date(weekStart as string)) : startOfDay(new Date());
    const end = endOfDay(addDays(start, 6));

    const bookings = await (prisma as any).roomBooking.findMany({
      where: {
        roomId: id,
        deletedAt: null,
        start: { gte: start },
        end: { lte: end },
      },
      include: {
        bookedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { start: 'asc' },
    });

    res.json({ success: true, data: { room, bookings, weekStart: start, weekEnd: end } });
  } catch (err) {
    logger.error('Room schedule error', { err });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAvailableNow(bookings: any[]): boolean {
  const now = new Date();
  return !bookings.some(
    (b) => new Date(b.start) <= now && new Date(b.end) >= now
  );
}
