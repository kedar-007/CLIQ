import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLogger } from '@comms/logger';

const logger = createLogger('file-service:storage');

export const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // MinIO endpoint for local dev
  forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
  },
});

const BUCKET = process.env.S3_BUCKET || 'comms-platform';

export async function generatePresignedUploadUrl(params: {
  fileKey: string;
  mimeType: string;
  fileSize: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.fileKey,
    ContentType: params.mimeType,
    ContentLength: params.fileSize,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
}

export async function generatePresignedDownloadUrl(fileKey: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
  return getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 hours
}

export async function deleteObject(fileKey: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: fileKey }));
  logger.info('Object deleted', { fileKey });
}

export async function objectExists(fileKey: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: fileKey }));
    return true;
  } catch {
    return false;
  }
}

export function buildPublicUrl(fileKey: string): string {
  return `${process.env.CDN_BASE_URL || `${process.env.S3_ENDPOINT}/${BUCKET}`}/${fileKey}`;
}
