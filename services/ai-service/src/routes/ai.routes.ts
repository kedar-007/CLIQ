import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import {
  summarizeThread,
  generateMeetingNotes,
  generateSmartReplies,
  improveMessage,
  translateMessage,
  summarizeFile,
  extractActionItems,
  analyzeStandupResponses,
} from '../services/anthropic.service';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('ai-service:routes');
export const aiRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
aiRouter.use(auth);

// POST /ai/summarize/thread
aiRouter.post('/summarize/thread', async (req: any, res: Response) => {
  try {
    const { threadId, channelId } = z.object({
      threadId: z.string().optional(),
      channelId: z.string().optional(),
    }).parse(req.body);

    const where: any = { deletedAt: null };
    if (threadId) where.threadId = threadId;
    else if (channelId) { where.channelId = channelId; }
    else { res.status(400).json({ success: false, error: 'threadId or channelId required' }); return; }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { sender: { select: { name: true } } },
    });

    const formatted = messages.map((m) => ({
      sender: m.sender.name,
      content: m.content || '[attachment]',
      timestamp: m.createdAt.toISOString(),
    }));

    const summary = await summarizeThread(formatted);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    logger.error('Summarize thread error', { err });
    res.status(500).json({ success: false, error: 'Summarization failed' });
  }
});

// POST /ai/meeting-notes
aiRouter.post('/meeting-notes', async (req: any, res: Response) => {
  try {
    const { callSessionId, transcript } = z.object({
      callSessionId: z.string().optional(),
      transcript: z.string().optional(),
    }).parse(req.body);

    let transcriptText = transcript;
    if (callSessionId && !transcript) {
      const session = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!session?.transcriptUrl) {
        res.status(400).json({ success: false, error: 'No transcript available' }); return;
      }
      transcriptText = 'Meeting transcript not yet loaded.'; // would fetch from S3
    }

    if (!transcriptText) {
      res.status(400).json({ success: false, error: 'Transcript required' }); return;
    }

    const notes = await generateMeetingNotes(transcriptText);

    if (callSessionId) {
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { summaryText: notes.summary },
      });
    }

    res.json({ success: true, data: notes });
  } catch (err) {
    logger.error('Meeting notes error', { err });
    res.status(500).json({ success: false, error: 'Meeting notes generation failed' });
  }
});

// POST /ai/smart-replies
aiRouter.post('/smart-replies', async (req: any, res: Response) => {
  try {
    const { channelId, lastMessageId } = z.object({
      channelId: z.string(),
      lastMessageId: z.string(),
    }).parse(req.body);

    const messages = await prisma.message.findMany({
      where: { channelId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { sender: { select: { name: true } } },
    });

    const lastMsg = messages.find((m) => m.id === lastMessageId);
    if (!lastMsg) { res.status(404).json({ success: false, error: 'Message not found' }); return; }

    const context = messages.reverse().map((m) => `${m.sender.name}: ${m.content}`).join('\n');
    const replies = await generateSmartReplies(context, lastMsg.content || '');

    res.json({ success: true, data: { replies } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Smart replies failed' });
  }
});

// POST /ai/improve-message
aiRouter.post('/improve-message', async (req: any, res: Response) => {
  try {
    const { message, instruction } = z.object({
      message: z.string().min(1).max(10000),
      instruction: z.enum(['grammar', 'shorten', 'expand', 'professional', 'casual']),
    }).parse(req.body);

    const improved = await improveMessage(message, instruction);
    res.json({ success: true, data: { improved } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Message improvement failed' });
  }
});

// POST /ai/translate
aiRouter.post('/translate', async (req: any, res: Response) => {
  try {
    const { text, targetLanguage } = z.object({
      text: z.string().min(1).max(5000),
      targetLanguage: z.string(),
    }).parse(req.body);

    const translated = await translateMessage(text, targetLanguage);
    res.json({ success: true, data: { translated, targetLanguage } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Translation failed' });
  }
});

// POST /ai/summarize/file
aiRouter.post('/summarize/file', async (req: any, res: Response) => {
  try {
    const { attachmentId, content } = z.object({
      attachmentId: z.string(),
      content: z.string().optional(),
    }).parse(req.body);

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) { res.status(404).json({ success: false, error: 'File not found' }); return; }

    const text = content || attachment.ocrText || 'No text content available for this file.';
    const summary = await summarizeFile(text, attachment.fileName);

    res.json({ success: true, data: { summary } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'File summarization failed' });
  }
});

// POST /ai/extract-action-items
aiRouter.post('/extract-action-items', async (req: any, res: Response) => {
  try {
    const { text, channelId } = z.object({ text: z.string(), channelId: z.string() }).parse(req.body);
    const items = await extractActionItems(text);
    res.json({ success: true, data: { items } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Action item extraction failed' });
  }
});

// POST /ai/standup-summary
aiRouter.post('/standup-summary', async (req: any, res: Response) => {
  try {
    const { responses } = z.object({
      responses: z.array(z.object({ user: z.string(), response: z.string() })),
    }).parse(req.body);

    const summary = await analyzeStandupResponses(responses);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Standup summary failed' });
  }
});
