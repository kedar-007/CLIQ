import { Kafka, Producer, Consumer, KafkaConfig, EachMessagePayload } from 'kafkajs';

// ─── Topic Definitions ────────────────────────────────────────────────────────

export const KAFKA_TOPICS = {
  // Chat
  MESSAGE_SENT: 'message.sent',
  MESSAGE_EDITED: 'message.edited',
  MESSAGE_DELETED: 'message.deleted',
  MESSAGE_REACTION: 'message.reaction',

  // Mentions & Notifications
  MENTION_CREATED: 'mention.created',
  NOTIFICATION_SEND: 'notification.send',
  EMAIL_SEND: 'email.send',

  // Files
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  FILE_OCR_COMPLETE: 'file.ocr.complete',

  // Calls
  CALL_STARTED: 'call.started',
  CALL_ENDED: 'call.ended',
  CALL_RECORDING_READY: 'call.recording.ready',
  CALL_TRANSCRIPT_READY: 'call.transcript.ready',

  // AI
  AI_SUMMARY_REQUEST: 'ai.summary.request',
  AI_SUMMARY_COMPLETE: 'ai.summary.complete',
  AI_ACTION_ITEM_DETECTED: 'ai.action_item.detected',

  // Tasks
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DUE_REMINDER: 'task.due.reminder',

  // Calendar
  CALENDAR_EVENT_CREATED: 'calendar.event.created',
  CALENDAR_REMINDER: 'calendar.reminder',

  // SCIM / Auth
  SCIM_USER_SYNC: 'scim.user.sync',

  // Analytics
  ANALYTICS_EVENT: 'analytics.event',

  // Billing
  BILLING_USAGE_UPDATED: 'billing.usage.updated',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

// ─── Event Payloads ───────────────────────────────────────────────────────────

export interface KafkaEventBase {
  eventId: string;
  tenantId: string;
  timestamp: string;
  version: '1.0';
}

export interface MessageSentEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.MESSAGE_SENT;
  data: {
    messageId: string;
    channelId: string;
    senderId: string;
    content: string;
    type: string;
    mentions: string[];
    hasAttachments: boolean;
  };
}

export interface NotificationSendEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.NOTIFICATION_SEND;
  data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channels: Array<'in-app' | 'push' | 'email'>;
  };
}

export interface EmailSendEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.EMAIL_SEND;
  data: {
    to: string;
    subject: string;
    template: string;
    variables: Record<string, unknown>;
  };
}

export interface FileUploadedEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.FILE_UPLOADED;
  data: {
    attachmentId: string;
    fileKey: string;
    mimeType: string;
    fileSize: number;
    channelId: string;
    uploaderId: string;
    needsOcr: boolean;
    needsThumbnail: boolean;
  };
}

export interface CallStartedEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.CALL_STARTED;
  data: {
    callSessionId: string;
    channelId?: string;
    type: string;
    startedBy: string;
    participantIds: string[];
  };
}

export interface CallEndedEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.CALL_ENDED;
  data: {
    callSessionId: string;
    duration: number;
    participantCount: number;
    recordingUrl?: string;
  };
}

export interface AiSummaryRequestEvent extends KafkaEventBase {
  topic: typeof KAFKA_TOPICS.AI_SUMMARY_REQUEST;
  data: {
    requestId: string;
    type: 'thread' | 'channel' | 'meeting' | 'file';
    resourceId: string;
    requestedBy: string;
  };
}

// ─── Kafka Client Factory ─────────────────────────────────────────────────────

export const createKafkaClient = (config?: Partial<KafkaConfig>): Kafka => {
  return new Kafka({
    clientId: config?.clientId || 'comms-platform',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
    ...config,
  });
};

// ─── Producer Helper ──────────────────────────────────────────────────────────

export class EventProducer {
  private producer: Producer;
  private connected = false;

  constructor(kafka: Kafka) {
    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publish<T extends KafkaEventBase>(
    topic: KafkaTopic,
    event: T
  ): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic,
      messages: [
        {
          key: event.tenantId,
          value: JSON.stringify(event),
          headers: {
            'event-type': topic,
            'event-id': event.eventId,
            version: event.version,
          },
        },
      ],
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

// ─── Consumer Helper ──────────────────────────────────────────────────────────

export class EventConsumer {
  private consumer: Consumer;

  constructor(kafka: Kafka, groupId: string) {
    this.consumer = kafka.consumer({ groupId });
  }

  async subscribe(
    topics: KafkaTopic[],
    handler: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    await this.consumer.connect();

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({ eachMessage: handler });
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}

// ─── Event Builder ────────────────────────────────────────────────────────────

export const buildEvent = <T>(
  topic: KafkaTopic,
  tenantId: string,
  data: T
): KafkaEventBase & { topic: KafkaTopic; data: T } => ({
  eventId: crypto.randomUUID(),
  tenantId,
  timestamp: new Date().toISOString(),
  version: '1.0',
  topic,
  data,
});
