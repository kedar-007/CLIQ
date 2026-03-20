// ─── Tenant & Auth ─────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  logoUrl?: string;
  brandColor?: string;
  customDomain?: string;
  dataRegion: 'US' | 'EU' | 'IN' | 'AU';
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  customStatusEmoji?: string;
  customStatusText?: string;
  customStatusExpiresAt?: Date;
  lastSeen?: Date;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  phoneNumber?: string;
  department?: string;
  jobTitle?: string;
  timezone?: string;
  locale?: string;
  isDeactivated: boolean;
  createdAt: Date;
  tenant?: { id: string; name: string; slug: string; plan: string };
}

export type UserRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER' | 'GUEST';
export type UserStatus = 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DND';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
}

// ─── Channel ────────────────────────────────────────────────────────────────

export type ChannelType = 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP_DM' | 'SHARED' | 'ANNOUNCEMENT';
export type ChannelMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
export type NotificationPreference = 'ALL' | 'MENTIONS' | 'NOTHING';

export interface Channel {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  topic?: string;
  type: ChannelType;
  createdBy: string;
  isArchived: boolean;
  isDefault: boolean;
  maxMembers?: number;
  joinApprovalRequired: boolean;
  retentionDays?: number;
  isReadOnly: boolean;
  memberCount?: number;
  createdAt: Date;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  role: ChannelMemberRole;
  lastReadAt?: Date;
  notificationPreference: NotificationPreference;
  isMuted: boolean;
  joinedAt: Date;
  user?: User;
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MessageType = 'TEXT' | 'FILE' | 'CALL' | 'SYSTEM' | 'BOT' | 'GIPHY';

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content?: string;
  contentRaw?: Record<string, unknown>;
  type: MessageType;
  threadId?: string;
  parentId?: string;
  isEdited: boolean;
  editedAt?: Date;
  deletedAt?: Date;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  sender?: User;
  reactions?: MessageReaction[];
  attachments?: Attachment[];
  replyCount?: number;
  thread?: Thread;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface Thread {
  id: string;
  channelId: string;
  parentMessageId: string;
  replyCount: number;
  lastActivityAt: Date;
  participants: User[];
}

// ─── Attachment / File ───────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  messageId?: string;
  channelId: string;
  uploaderId: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  thumbnailUrl?: string;
  mimeType: string;
  fileSize: number;
  version: number;
  ocrText?: string;
  virusScanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR';
  createdAt: Date;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  fileKey: string;
  fileId: string;
  expiresAt: Date;
}

// ─── Call ─────────────────────────────────────────────────────────────────────

export type CallType = 'AUDIO' | 'VIDEO' | 'PSTN' | 'WEBINAR' | 'TOWNHALL';

export interface CallSession {
  id: string;
  tenantId: string;
  channelId?: string;
  liveKitRoomId?: string;
  type: CallType;
  startedBy: string;
  startedAt: Date;
  endedAt?: Date;
  recordingUrl?: string;
  transcriptUrl?: string;
  summaryText?: string;
  participantCount: number;
}

export interface CallParticipant {
  id: string;
  callSessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
  role: 'HOST' | 'PRESENTER' | 'ATTENDEE';
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  user?: User;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  messageId?: string;
  taskId?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export type NotificationType =
  | 'MESSAGE_MENTION'
  | 'MESSAGE_REPLY'
  | 'CHANNEL_INVITE'
  | 'CALL_INCOMING'
  | 'CALL_MISSED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE'
  | 'TASK_COMMENT'
  | 'MEETING_REMINDER'
  | 'MEETING_INVITE'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'KEYWORD_ALERT'
  | 'REACTION_ADDED';

// ─── Task ─────────────────────────────────────────────────────────────────────

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  tenantId: string;
  channelId?: string;
  creatorId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: Date;
  estimatedMinutes?: number;
  assigneeIds: string[];
  labelIds: string[];
  parentTaskId?: string;
  customFields?: Record<string, unknown>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  creator?: User;
  assignees?: User[];
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  tenantId: string;
  creatorId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  recurrenceRule?: string;
  meetingLink?: string;
  callSessionId?: string;
  source: 'INTERNAL' | 'GOOGLE' | 'MICROSOFT';
  attendees: CalendarAttendee[];
  createdAt: Date;
}

export interface CalendarAttendee {
  id: string;
  eventId: string;
  userId?: string;
  externalEmail?: string;
  status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'PENDING';
  isOrganizer: boolean;
  user?: User;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export interface PresenceUpdate {
  userId: string;
  tenantId: string;
  status: UserStatus;
  customStatusEmoji?: string;
  customStatusText?: string;
  lastSeen?: Date;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'MESSAGE' | 'FILE' | 'CHANNEL' | 'USER' | 'TASK';
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  imageUrl?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface SearchFilters {
  from?: string;
  in?: string;
  before?: string;
  after?: string;
  hasLink?: boolean;
  hasFile?: boolean;
  hasReaction?: boolean;
  type?: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface CursorPage<T> {
  data: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
  total?: number;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export interface SocketEvent<T = unknown> {
  event: string;
  data: T;
  timestamp: Date;
}

export type ClientToServerEvents = {
  'message:send': (data: {
    channelId: string;
    content: string;
    contentRaw?: Record<string, unknown>;
    parentId?: string;
    attachmentIds?: string[];
    scheduledAt?: string;
  }) => void;
  'message:edit': (data: { messageId: string; content: string; contentRaw?: Record<string, unknown> }) => void;
  'message:delete': (data: { messageId: string }) => void;
  'message:react': (data: { messageId: string; emoji: string; action: 'add' | 'remove' }) => void;
  'message:pin': (data: { channelId: string; messageId: string }) => void;
  'message:save': (data: { messageId: string }) => void;
  'typing:start': (data: { channelId: string }) => void;
  'typing:stop': (data: { channelId: string }) => void;
  'read:mark': (data: { channelId: string; messageId: string }) => void;
  'presence:update': (data: { status: UserStatus; customStatusEmoji?: string; customStatusText?: string }) => void;
  'channel:join': (data: { channelId: string }) => void;
  'channel:leave': (data: { channelId: string }) => void;
  'thread:subscribe': (data: { threadId: string }) => void;
  'call:initiate': (data: { channelId?: string; userIds: string[]; type: CallType }) => void;
  'call:accept': (data: { callSessionId: string }) => void;
  'call:decline': (data: { callSessionId: string; reason?: string }) => void;
  'call:end': (data: { callSessionId: string }) => void;
  'poll:vote': (data: { pollId: string; selectedOptions: string[] }) => void;
};

export type ServerToClientEvents = {
  'message:new': (data: Message) => void;
  'message:updated': (data: Partial<Message> & { id: string }) => void;
  'message:deleted': (data: { messageId: string; channelId: string }) => void;
  'message:reaction': (data: { messageId: string; emoji: string; userId: string; action: 'add' | 'remove'; count: number }) => void;
  'typing:user': (data: { channelId: string; userId: string; user: Pick<User, 'id' | 'name' | 'avatarUrl'>; isTyping: boolean }) => void;
  'presence:update': (data: PresenceUpdate) => void;
  'notification:new': (data: Notification) => void;
  'call:incoming': (data: { callSessionId: string; from: User; type: CallType; channelId?: string }) => void;
  'call:ended': (data: { callSessionId: string }) => void;
  'call:participant_joined': (data: { callSessionId: string; participant: CallParticipant }) => void;
  'call:participant_left': (data: { callSessionId: string; userId: string }) => void;
  'channel:updated': (data: Partial<Channel> & { id: string }) => void;
  'member:joined': (data: { channelId: string; member: ChannelMember }) => void;
  'member:left': (data: { channelId: string; userId: string }) => void;
  'poll:updated': (data: { pollId: string; votes: Record<string, number> }) => void;
};

// ─── Plan feature flags ───────────────────────────────────────────────────────

export interface PlanFeatures {
  maxUsers: number | 'unlimited';
  maxChannels: number | 'unlimited';
  storageGb: number | 'unlimited';
  maxCallParticipants: number;
  messageHistoryDays: number | 'unlimited';
  bots: boolean;
  integrations: boolean;
  tasks: boolean;
  samlSSO: boolean;
  scim: boolean;
  customDomain: boolean;
  whiteLabel: boolean;
  aiFeatures: boolean;
  complianceExport: boolean;
  dlp: boolean;
  auditLog: boolean;
  dataResidency: boolean;
  e2eEncryption: boolean;
  webinars: boolean;
  recordingCloud: boolean;
}

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  FREE: {
    maxUsers: 10,
    maxChannels: 10,
    storageGb: 5,
    maxCallParticipants: 2,
    messageHistoryDays: 30,
    bots: false,
    integrations: false,
    tasks: false,
    samlSSO: false,
    scim: false,
    customDomain: false,
    whiteLabel: false,
    aiFeatures: false,
    complianceExport: false,
    dlp: false,
    auditLog: false,
    dataResidency: false,
    e2eEncryption: false,
    webinars: false,
    recordingCloud: false,
  },
  PRO: {
    maxUsers: 'unlimited',
    maxChannels: 'unlimited',
    storageGb: 100,
    maxCallParticipants: 100,
    messageHistoryDays: 'unlimited',
    bots: true,
    integrations: true,
    tasks: true,
    samlSSO: false,
    scim: false,
    customDomain: false,
    whiteLabel: false,
    aiFeatures: true,
    complianceExport: false,
    dlp: false,
    auditLog: true,
    dataResidency: false,
    e2eEncryption: false,
    webinars: true,
    recordingCloud: true,
  },
  ENTERPRISE: {
    maxUsers: 'unlimited',
    maxChannels: 'unlimited',
    storageGb: 'unlimited',
    maxCallParticipants: 1000,
    messageHistoryDays: 'unlimited',
    bots: true,
    integrations: true,
    tasks: true,
    samlSSO: true,
    scim: true,
    customDomain: true,
    whiteLabel: true,
    aiFeatures: true,
    complianceExport: true,
    dlp: true,
    auditLog: true,
    dataResidency: true,
    e2eEncryption: true,
    webinars: true,
    recordingCloud: true,
  },
};
