import { nanoid } from 'nanoid';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

// ─── ID Generation ────────────────────────────────────────────────────────────

export const generateId = (size = 21) => nanoid(size);

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 50);
};

// ─── Date & Time ──────────────────────────────────────────────────────────────

export const formatDate = (date: Date | string, fmt = 'MMM d, yyyy'): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
};

export const formatTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
};

export const formatRelative = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
};

export const formatMessageTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return format(d, 'h:mm a');
  if (diffDays < 7) return format(d, 'EEE h:mm a');
  return format(d, 'MMM d, h:mm a');
};

// ─── String Utils ─────────────────────────────────────────────────────────────

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return str.slice(0, length) + '…';
};

export const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

export const initials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const parseAtMentions = (content: string): string[] => {
  const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
  const matches = content.matchAll(mentionRegex);
  return [...matches].map((m) => m[1]);
};

export const parseSlashCommand = (content: string): { command: string; args: string[] } | null => {
  if (!content.startsWith('/')) return null;
  const parts = content.slice(1).trim().split(/\s+/);
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1),
  };
};

// ─── File Utils ───────────────────────────────────────────────────────────────

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileExtension = (filename: string): string => {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
};

export const isImageMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith('image/');
};

export const isVideoMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith('video/');
};

export const isAudioMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith('audio/');
};

export const isPdfMimeType = (mimeType: string): boolean => {
  return mimeType === 'application/pdf';
};

export const isOfficeMimeType = (mimeType: string): boolean => {
  const officeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  return officeTypes.includes(mimeType);
};

// ─── Validation ───────────────────────────────────────────────────────────────

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidSlug = (slug: string): boolean => {
  return /^[a-z0-9-]{2,50}$/.test(slug);
};

export const containsCreditCardPattern = (text: string): boolean => {
  return /\b(?:\d[ -]?){13,16}\b/.test(text);
};

export const containsSSNPattern = (text: string): boolean => {
  return /\b\d{3}[-]?\d{2}[-]?\d{4}\b/.test(text);
};

// ─── Pagination ───────────────────────────────────────────────────────────────

export const encodeCursor = (value: string): string =>
  Buffer.from(value).toString('base64');

export const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64').toString('utf8');

// ─── Color ────────────────────────────────────────────────────────────────────

export const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 50%)`;
};

// ─── Async ────────────────────────────────────────────────────────────────────

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  }
};
