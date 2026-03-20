import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { redis } from '../config/redis';
import { Queue } from 'bullmq';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('task-service:routes');
export const tasksRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
tasksRouter.use(auth);

const taskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  channelId: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueAt: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  assigneeIds: z.array(z.string()).default([]),
  labelIds: z.array(z.string()).default([]),
  parentTaskId: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});

// GET /tasks — list tasks with filters
tasksRouter.get('/', async (req: any, res: Response) => {
  try {
    const { channelId, status, priority, assigneeId, dueAfter, dueBefore, cursor, limit = 50 } = req.query;

    const where: any = {
      tenantId: req.user.tenantId,
      deletedAt: null,
      ...(channelId && { channelId }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assigneeId && { assigneeIds: { has: assigneeId } }),
      ...(dueAfter && { dueAt: { gte: new Date(dueAfter as string) } }),
      ...(dueBefore && { dueAt: { ...(dueAfter ? { gte: new Date(dueAfter as string) } : {}), lte: new Date(dueBefore as string) } }),
      ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
    };

    const tasks = await prisma.task.findMany({
      where,
      take: Math.min(parseInt(limit as string), 100),
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });

    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// POST /tasks — create task
tasksRouter.post('/', async (req: any, res: Response) => {
  try {
    const body = taskCreateSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        ...body,
        tenantId: req.user.tenantId,
        creatorId: req.user.sub,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: { creator: { select: { id: true, name: true, avatarUrl: true } } },
    });

    // Schedule reminders if due date set
    if (task.dueAt) {
      const notifQueue = new Queue('notifications', { connection: redis });
      const reminderTime = new Date(task.dueAt.getTime() - 60 * 60 * 1000); // 1 hour before
      const delay = reminderTime.getTime() - Date.now();
      if (delay > 0) {
        for (const assigneeId of task.assigneeIds) {
          await notifQueue.add('task-reminder', {
            userId: assigneeId,
            tenantId: task.tenantId,
            type: 'TASK_DUE',
            title: `Task due in 1 hour: ${task.title}`,
            body: task.description?.slice(0, 100) || '',
            data: { taskId: task.id },
            channels: ['in-app', 'push'],
          }, { delay });
        }
      }
    }

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() }); return;
    }
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// GET /tasks/:id
tasksRouter.get('/:id', async (req: any, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        checklists: { orderBy: { sortOrder: 'asc' } },
        subtasks: { where: { deletedAt: null } },
      },
    });

    if (!task) { res.status(404).json({ success: false, error: 'Task not found' }); return; }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

// PATCH /tasks/:id — update task
tasksRouter.patch('/:id', async (req: any, res: Response) => {
  try {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Task not found' }); return; }

    const updates = req.body;
    if (updates.dueAt) updates.dueAt = new Date(updates.dueAt);
    if (updates.status === 'DONE') updates.completedAt = new Date();
    if (updates.status && updates.status !== 'DONE') updates.completedAt = null;

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: updates,
    });

    // Log activity
    const changedFields = Object.keys(updates).filter((k) => (existing as any)[k] !== (updated as any)[k]);
    for (const field of changedFields) {
      await prisma.taskActivity.create({
        data: {
          taskId: req.params.id,
          actorId: req.user.sub,
          action: `updated_${field}`,
          oldValue: { value: (existing as any)[field] },
          newValue: { value: (updated as any)[field] },
        },
      });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// DELETE /tasks/:id — soft delete
tasksRouter.delete('/:id', async (req: any, res: Response) => {
  await prisma.task.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.json({ success: true });
});

// POST /tasks/:id/comments — add comment
tasksRouter.post('/:id/comments', async (req: any, res: Response) => {
  try {
    const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
    const comment = await prisma.taskComment.create({
      data: { taskId: req.params.id, authorId: req.user.sub, content },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

// GET /tasks/:id/comments
tasksRouter.get('/:id/comments', async (req: any, res: Response) => {
  const comments = await prisma.taskComment.findMany({
    where: { taskId: req.params.id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  res.json({ success: true, data: comments });
});

// PATCH /tasks/:id/checklist/:itemId
tasksRouter.patch('/:id/checklist/:itemId', async (req: any, res: Response) => {
  const { isComplete } = req.body;
  const item = await prisma.taskChecklist.update({
    where: { id: req.params.itemId },
    data: { isComplete, completedAt: isComplete ? new Date() : null },
  });
  res.json({ success: true, data: item });
});

// GET /tasks/my-tasks
tasksRouter.get('/my-tasks', async (req: any, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: {
      tenantId: req.user.tenantId,
      deletedAt: null,
      OR: [
        { creatorId: req.user.sub },
        { assigneeIds: { has: req.user.sub } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
    take: 100,
  });
  res.json({ success: true, data: tasks });
});

// GET /tasks/board/:channelId — kanban view
tasksRouter.get('/board/:channelId', async (req: any, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: { channelId: req.params.channelId, tenantId: req.user.tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const board = {
    TODO: tasks.filter((t) => t.status === 'TODO'),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
    CANCELLED: tasks.filter((t) => t.status === 'CANCELLED'),
  };

  res.json({ success: true, data: board });
});

// POST /tasks/from-message — create task from message
tasksRouter.post('/from-message', async (req: any, res: Response) => {
  try {
    const { messageId, channelId } = z.object({
      messageId: z.string(),
      channelId: z.string(),
    }).parse(req.body);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { sender: { select: { name: true } } },
    });

    if (!message) { res.status(404).json({ success: false, error: 'Message not found' }); return; }

    const task = await prisma.task.create({
      data: {
        tenantId: req.user.tenantId,
        channelId,
        creatorId: req.user.sub,
        title: (message.content || '').slice(0, 200) || 'Task from message',
        description: `Created from message by ${message.sender.name}`,
        status: 'TODO',
        priority: 'MEDIUM',
        assigneeIds: [req.user.sub],
      },
    });

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create task from message' });
  }
});
