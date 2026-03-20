import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import axios from 'axios';

const logger = createLogger('bot-service:standup-service');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

const DEFAULT_STANDUP_QUESTIONS = [
  "What did you work on yesterday?",
  "What are you working on today?",
  "Are there any blockers or impediments?",
];

export interface StandupResponse {
  userId: string;
  answers: string[];
}

/**
 * Start a standup session for a channel.
 * Creates a standup session record and DMs each channel member with the questions.
 */
export async function startStandup(
  channelId: string,
  tenantId: string,
  initiatedBy: string,
  questions: string[] = DEFAULT_STANDUP_QUESTIONS
): Promise<string> {
  // Fetch channel members
  const members = await (prisma as any).channelMember.findMany({
    where: { channelId, deletedAt: null },
    select: { userId: true },
  });

  if (members.length === 0) {
    throw new Error('No members in channel');
  }

  // Create standup session
  const session = await (prisma as any).standupSession.create({
    data: {
      channelId,
      tenantId,
      initiatedBy,
      questions,
      status: 'COLLECTING',
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours to respond
      totalMembers: members.length,
      respondedCount: 0,
    },
  });

  // DM each member with the questions
  const questionText = questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const dmPromises = members.map(async (member: { userId: string }) => {
    try {
      // Find or create DM channel between bot and user
      await axios.post(
        `${CHAT_SERVICE_URL}/messages`,
        {
          userId: member.userId,
          tenantId,
          systemMessage: true,
          content: `📋 *Standup time!* Please reply to this session (ID: ${session.id}):\n\n${questionText}\n\n_Reply with your answers separated by line breaks._`,
          metadata: { standupSessionId: session.id, type: 'standup-prompt' },
        },
        { headers: { 'x-service-secret': SERVICE_SECRET } }
      );
    } catch (err) {
      logger.warn('Failed to DM member for standup', { userId: member.userId, err });
    }
  });

  await Promise.allSettled(dmPromises);

  // Post notification to channel
  await axios.post(
    `${CHAT_SERVICE_URL}/messages`,
    {
      channelId,
      tenantId,
      isBot: true,
      botName: 'StandupBot',
      content: `📋 *Standup started!* I've DM'd all ${members.length} members. Questions:\n\n${questionText}\n\nI'll post a summary once everyone responds or in 4 hours.`,
      metadata: { standupSessionId: session.id, type: 'standup-start' },
    },
    { headers: { 'x-service-secret': SERVICE_SECRET } }
  );

  logger.info('Standup session started', { sessionId: session.id, channelId, memberCount: members.length });
  return session.id;
}

/**
 * Record a user's standup response.
 */
export async function recordResponse(
  userId: string,
  standupId: string,
  responses: string[]
): Promise<void> {
  const session = await (prisma as any).standupSession.findFirst({
    where: { id: standupId, status: 'COLLECTING' },
  });

  if (!session) {
    throw new Error('Standup session not found or already closed');
  }

  // Upsert response
  await (prisma as any).standupResponse.upsert({
    where: { standupSessionId_userId: { standupSessionId: standupId, userId } },
    create: {
      standupSessionId: standupId,
      userId,
      responses,
      submittedAt: new Date(),
    },
    update: {
      responses,
      submittedAt: new Date(),
    },
  });

  // Increment response count
  const updated = await (prisma as any).standupSession.update({
    where: { id: standupId },
    data: { respondedCount: { increment: 1 } },
  });

  logger.info('Standup response recorded', { standupId, userId });

  // Auto-compile summary if everyone responded
  if (updated.respondedCount >= updated.totalMembers) {
    await compileSummary(standupId);
  }
}

/**
 * Compile all responses and post the summary to the channel.
 */
export async function compileSummary(standupId: string): Promise<void> {
  const session = await (prisma as any).standupSession.findUnique({
    where: { id: standupId },
    include: {
      responses: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!session) {
    throw new Error('Standup session not found');
  }

  if (session.responses.length === 0) {
    logger.warn('No responses for standup', { standupId });
    return;
  }

  // Build summary text
  const summaryLines: string[] = [
    `📊 *Standup Summary* — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
    `_${session.responses.length} of ${session.totalMembers} members responded_\n`,
  ];

  for (const response of session.responses) {
    summaryLines.push(`👤 *${response.user.name}*`);
    session.questions.forEach((question: string, i: number) => {
      summaryLines.push(`  *${question}*`);
      summaryLines.push(`  ${response.responses[i] || '_No answer_'}`);
    });
    summaryLines.push('');
  }

  const summaryText = summaryLines.join('\n');

  // Post to channel
  await axios.post(
    `${CHAT_SERVICE_URL}/messages`,
    {
      channelId: session.channelId,
      tenantId: session.tenantId,
      isBot: true,
      botName: 'StandupBot',
      content: summaryText,
      metadata: { standupSessionId: standupId, type: 'standup-summary' },
    },
    { headers: { 'x-service-secret': SERVICE_SECRET } }
  );

  // Mark session as complete
  await (prisma as any).standupSession.update({
    where: { id: standupId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  logger.info('Standup summary posted', { standupId, channelId: session.channelId });
}
