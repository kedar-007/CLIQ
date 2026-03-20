import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { redis } from '../config/redis';
import { Queue } from 'bullmq';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { generatePresignedUploadUrl, generatePresignedDownloadUrl, deleteObject } from '../services/storage.service';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('file-service:routes');
export const filesRouter = Router();

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
filesRouter.use(auth);

// POST /files/presign — generate S3 presigned PUT URL
filesRouter.post('/presign', async (req: any, res: Response) => {
  try {
    const { fileName, mimeType, fileSize, channelId } = z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileSize: z.number().max(100 * 1024 * 1024), // 100MB
      channelId: z.string(),
    }).parse(req.body);

    const fileId = uuidv4();
    const ext = fileName.split('.').pop() || 'bin';
    const fileKey = `uploads/${req.user.tenantId}/${channelId}/${fileId}.${ext}`;

    const uploadUrl = await generatePresignedUploadUrl({ fileKey, mimeType, fileSize });

    // Store pending upload metadata in Redis (30 min expiry)
    await redis.setex(`pending_upload:${fileId}`, 1800, JSON.stringify({
      fileId, fileKey, fileName, mimeType, fileSize, channelId,
      uploaderId: req.user.sub, tenantId: req.user.tenantId,
    }));

    res.json({
      success: true,
      data: { uploadUrl, fileKey, fileId, expiresAt: new Date(Date.now() + 3600000) },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to generate upload URL' });
  }
});

// POST /files/confirm — confirm upload, create DB record
filesRouter.post('/confirm', async (req: any, res: Response) => {
  try {
    const { fileId, messageId } = z.object({
      fileId: z.string(),
      messageId: z.string().optional(),
    }).parse(req.body);

    const metaJson = await redis.get(`pending_upload:${fileId}`);
    if (!metaJson) {
      res.status(400).json({ success: false, error: 'Upload not found or expired' }); return;
    }

    const meta = JSON.parse(metaJson);
    await redis.del(`pending_upload:${fileId}`);

    const fileUrl = `${process.env.CDN_BASE_URL || `http://localhost:9000/comms-platform`}/${meta.fileKey}`;

    const attachment = await prisma.attachment.create({
      data: {
        id: fileId,
        messageId,
        channelId: meta.channelId,
        uploaderId: meta.uploaderId,
        fileName: meta.fileName,
        fileKey: meta.fileKey,
        fileUrl,
        mimeType: meta.mimeType,
        fileSize: meta.fileSize,
      },
    });

    // Queue thumbnail generation and virus scan
    const thumbnailQueue = new Queue('thumbnails', { connection: redis });
    const virusScanQueue = new Queue('virus-scan', { connection: redis });

    if (meta.mimeType.startsWith('image/')) {
      await thumbnailQueue.add('generate', { attachmentId: attachment.id, fileKey: meta.fileKey });
    }
    await virusScanQueue.add('scan', { attachmentId: attachment.id, fileKey: meta.fileKey });

    res.json({ success: true, data: attachment });
  } catch (err) {
    logger.error('File confirm error', { err });
    res.status(500).json({ success: false, error: 'Failed to confirm upload' });
  }
});

// GET /files/:id
filesRouter.get('/:id', async (req: any, res: Response) => {
  try {
    const file = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!file || file.deletedAt) {
      res.status(404).json({ success: false, error: 'File not found' }); return;
    }

    const signedUrl = await generatePresignedDownloadUrl(file.fileKey);
    res.json({ success: true, data: { ...file, signedUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch file' });
  }
});

// GET /files/:id/versions
filesRouter.get('/:id/versions', async (req: any, res: Response) => {
  try {
    const versions = await prisma.fileVersion.findMany({
      where: { attachmentId: req.params.id },
      orderBy: { uploadedAt: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: versions });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch versions' });
  }
});

// POST /files/:id/version — upload new version
filesRouter.post('/:id/version', async (req: any, res: Response) => {
  try {
    const { fileName, mimeType, fileSize } = req.body;
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) { res.status(404).json({ success: false, error: 'File not found' }); return; }

    const ext = fileName.split('.').pop() || 'bin';
    const fileKey = `uploads/${req.user.tenantId}/${attachment.channelId}/${req.params.id}-v${Date.now()}.${ext}`;
    const uploadUrl = await generatePresignedUploadUrl({ fileKey, mimeType, fileSize });

    // Create version record for the old version
    await prisma.fileVersion.create({
      data: {
        attachmentId: attachment.id,
        fileKey: attachment.fileKey,
        fileUrl: attachment.fileUrl,
        fileSize: attachment.fileSize,
        uploadedBy: attachment.uploaderId,
      },
    });

    const fileUrl = `${process.env.CDN_BASE_URL}/${fileKey}`;
    await prisma.attachment.update({
      where: { id: req.params.id },
      data: { fileKey, fileUrl, fileName, mimeType, fileSize, version: { increment: 1 } },
    });

    res.json({ success: true, data: { uploadUrl, fileKey } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create version' });
  }
});

// DELETE /files/:id — soft delete
filesRouter.delete('/:id', async (req: any, res: Response) => {
  try {
    const file = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!file) { res.status(404).json({ success: false, error: 'File not found' }); return; }
    if (file.uploaderId !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' }); return;
    }

    await prisma.attachment.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
});

// POST /files/:id/restore
filesRouter.post('/:id/restore', async (req: any, res: Response) => {
  await prisma.attachment.update({ where: { id: req.params.id }, data: { deletedAt: null } });
  res.json({ success: true });
});

// GET /files/trash
filesRouter.get('/trash', async (req: any, res: Response) => {
  const files = await prisma.attachment.findMany({
    where: { uploaderId: req.user.sub, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
  });
  res.json({ success: true, data: files });
});
