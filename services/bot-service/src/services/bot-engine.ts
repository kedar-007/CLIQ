import axios from 'axios';
import { prisma } from '@comms/db';
import { createLogger } from '@comms/logger';
import { scheduleReminder, parseReminderArgs } from './reminder.service';
import { startStandup } from './standup.service';
import { redis } from '../config/redis';

const logger = createLogger('bot-service:bot-engine');

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3002';
const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL || 'http://localhost:3008';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs/search';
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'internal';

export interface SlashCommandContext {
  userId: string;
  tenantId: string;
  channelId: string;
}

export interface SlashCommandResult {
  handled: boolean;
  message?: string;
  data?: unknown;
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function executeSlashCommand(
  command: string,
  args: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const cmd = command.toLowerCase().replace(/^\//, '');

  switch (cmd) {
    case 'poll':      return handlePoll(args, context);
    case 'remind':    return handleRemind(args, context);
    case 'standup':   return handleStandup(args, context);
    case 'task':      return handleTask(args, context);
    case 'giphy':     return handleGiphy(args, context);
    case 'time':      return handleTime(args, context);
    case 'wiki':      return handleWiki(args, context);
    case 'help':      return handleHelp(context);
    default:
      return { handled: false, message: `Unknown command /${cmd}. Use /help to see available commands.` };
  }
}

// ─── /poll Question | Option1 | Option2 | Option3 ────────────────────────────

async function handlePoll(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const parts = args.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) {
    return {
      handled: false,
      message: 'Usage: /poll Question | Option1 | Option2 [| Option3 ...]',
    };
  }

  const [question, ...options] = parts;
  if (options.length > 10) {
    return { handled: false, message: 'Maximum 10 poll options allowed.' };
  }

  // Create poll in DB
  const poll = await (prisma as any).poll.create({
    data: {
      question,
      options: options.map((text, idx) => ({ id: idx, text, votes: 0 })),
      channelId: context.channelId,
      tenantId: context.tenantId,
      createdBy: context.userId,
      isActive: true,
    },
  });

  // Format poll message and post to channel
  const optionLines = options.map((opt, i) => `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][i] || `${i+1}.`} ${opt}`).join('\n');
  const content = `📊 *Poll: ${question}*\n\n${optionLines}\n\n_React to vote!_`;

  await postToChannel(context.channelId, context.tenantId, content, { pollId: poll.id });

  return { handled: true, data: { pollId: poll.id }, message: 'Poll created!' };
}

// ─── /remind @user message in 30m ────────────────────────────────────────────

async function handleRemind(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const parsed = parseReminderArgs(args);
  if (!parsed) {
    return {
      handled: false,
      message: 'Usage: /remind [@user] <message> in <delay> (e.g. /remind standup in 30m)',
    };
  }

  const { targetUser, message, delayMs } = parsed;

  let targetUserId = context.userId;
  if (targetUser) {
    const user = await (prisma as any).user.findFirst({
      where: {
        OR: [{ name: { contains: targetUser, mode: 'insensitive' } }, { email: targetUser }],
        tenantId: context.tenantId,
      },
      select: { id: true, name: true },
    });
    if (!user) {
      return { handled: false, message: `User @${targetUser} not found.` };
    }
    targetUserId = user.id;
  }

  const jobId = await scheduleReminder(
    targetUserId,
    context.channelId,
    message,
    delayMs,
    context.tenantId,
    context.userId,
    redis
  );

  const when = new Date(Date.now() + delayMs);
  const timeStr = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return {
    handled: true,
    data: { jobId },
    message: `⏰ Reminder set for ${timeStr}: "${message}"`,
  };
}

// ─── /standup start ───────────────────────────────────────────────────────────

async function handleStandup(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const subCommand = args.trim().toLowerCase();

  if (subCommand !== 'start' && subCommand !== '') {
    return { handled: false, message: 'Usage: /standup start' };
  }

  const sessionId = await startStandup(
    context.channelId,
    context.tenantId,
    context.userId
  );

  return {
    handled: true,
    data: { sessionId },
    message: 'Standup started! I\'ve DM\'d all channel members.',
  };
}

// ─── /task Title ─────────────────────────────────────────────────────────────

async function handleTask(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const title = args.trim();
  if (!title) {
    return { handled: false, message: 'Usage: /task <title>' };
  }

  try {
    const response = await axios.post(
      `${TASK_SERVICE_URL}/tasks`,
      {
        title,
        channelId: context.channelId,
        tenantId: context.tenantId,
        createdBy: context.userId,
        status: 'TODO',
        priority: 'MEDIUM',
      },
      { headers: { 'x-service-secret': SERVICE_SECRET } }
    );

    const task = response.data?.data;
    await postToChannel(
      context.channelId,
      context.tenantId,
      `✅ Task created: *${title}* (ID: ${task?.id || 'new'})`,
      { taskId: task?.id }
    );

    return { handled: true, data: { taskId: task?.id }, message: `Task "${title}" created!` };
  } catch (err) {
    logger.error('Task creation failed', { err });
    return { handled: false, message: 'Failed to create task. Please try again.' };
  }
}

// ─── /giphy query ────────────────────────────────────────────────────────────

async function handleGiphy(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const query = args.trim();
  if (!query) {
    return { handled: false, message: 'Usage: /giphy <search query>' };
  }

  if (!GIPHY_API_KEY) {
    return { handled: false, message: 'Giphy integration is not configured.' };
  }

  try {
    const response = await axios.get(GIPHY_API_URL, {
      params: { api_key: GIPHY_API_KEY, q: query, limit: 5, rating: 'g' },
      timeout: 5000,
    });

    const gifs = response.data?.data;
    if (!gifs || gifs.length === 0) {
      return { handled: false, message: `No GIFs found for "${query}".` };
    }

    // Pick a random one from first 5 results
    const gif = gifs[Math.floor(Math.random() * gifs.length)];
    const gifUrl = gif.images?.original?.url || gif.url;

    await postToChannel(
      context.channelId,
      context.tenantId,
      `![${query}](${gifUrl})`,
      { type: 'giphy', query, gifId: gif.id }
    );

    return { handled: true, data: { gifUrl }, message: 'GIF posted!' };
  } catch (err) {
    logger.error('Giphy fetch failed', { err, query });
    return { handled: false, message: 'Failed to fetch GIF. Please try again.' };
  }
}

// ─── /time timezone ──────────────────────────────────────────────────────────

async function handleTime(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const timezone = args.trim() || 'UTC';

  try {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    await postToChannel(
      context.channelId,
      context.tenantId,
      `🕐 Current time in *${timezone}*: ${timeStr}`,
      { type: 'time', timezone }
    );

    return { handled: true, message: `Time posted for ${timezone}` };
  } catch {
    return {
      handled: false,
      message: `Invalid timezone: "${timezone}". Use IANA timezone names (e.g. America/New_York, Asia/Kolkata).`,
    };
  }
}

// ─── /wiki query ─────────────────────────────────────────────────────────────

async function handleWiki(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
  const query = args.trim();
  if (!query) {
    return { handled: false, message: 'Usage: /wiki <search query>' };
  }

  try {
    const encodedQuery = encodeURIComponent(query.replace(/ /g, '_'));
    const response = await axios.get(`${WIKIPEDIA_API_URL}/${encodedQuery}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'DSV-CLIQ-Bot/1.0' },
    });

    const article = response.data;
    const summary = article.extract ? article.extract.slice(0, 500) + (article.extract.length > 500 ? '…' : '') : 'No summary available.';
    const pageUrl = article.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodedQuery}`;

    const content = `📖 *${article.title}*\n\n${summary}\n\n[Read more on Wikipedia](${pageUrl})`;

    await postToChannel(context.channelId, context.tenantId, content, { type: 'wiki', query });

    return { handled: true, message: 'Wikipedia summary posted!' };
  } catch (err: any) {
    if (err.response?.status === 404) {
      return { handled: false, message: `No Wikipedia article found for "${query}".` };
    }
    logger.error('Wikipedia fetch failed', { err, query });
    return { handled: false, message: 'Failed to fetch Wikipedia article. Please try again.' };
  }
}

// ─── /help ───────────────────────────────────────────────────────────────────

async function handleHelp(context: SlashCommandContext): Promise<SlashCommandResult> {
  const helpText = [
    '📖 *Available Slash Commands*\n',
    '`/poll Question | Option1 | Option2 | ...` — Create a poll with up to 10 options',
    '`/remind [@user] <message> in <delay>` — Set a reminder (e.g. `/remind standup in 30m`)',
    '`/standup start` — Start a standup collection for this channel',
    '`/task <title>` — Create a new task in the current channel',
    '`/giphy <query>` — Post a random GIF matching your search',
    '`/time <timezone>` — Show current time in a timezone (e.g. `/time America/New_York`)',
    '`/wiki <query>` — Search Wikipedia and post a summary',
    '`/help` — Show this help message',
  ].join('\n');

  await postToChannel(context.channelId, context.tenantId, helpText, { type: 'help' });
  return { handled: true, message: 'Help posted!' };
}

// ─── Outgoing webhook processor ───────────────────────────────────────────────

export interface OutgoingWebhookPayload {
  channelId: string;
  tenantId: string;
  messageContent: string;
  userId: string;
  messageId: string;
}

export async function processOutgoingWebhooks(message: OutgoingWebhookPayload): Promise<void> {
  try {
    const configs = await (prisma as any).outgoingWebhook.findMany({
      where: {
        tenantId: message.tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { channelId: message.channelId },
          { channelId: null },
        ],
      },
    });

    if (configs.length === 0) return;

    const matchingConfigs = configs.filter((config: any) => {
      if (config.triggerOnAllMessages) return true;
      if (!config.triggerWords || config.triggerWords.length === 0) return false;
      const contentLower = message.messageContent.toLowerCase();
      return config.triggerWords.some((word: string) => contentLower.includes(word.toLowerCase()));
    });

    const firePromises = matchingConfigs.map(async (config: any) => {
      try {
        const payload = {
          token: config.secret || '',
          teamId: message.tenantId,
          channelId: message.channelId,
          userId: message.userId,
          messageId: message.messageId,
          text: message.messageContent,
          timestamp: new Date().toISOString(),
        };

        await axios.post(config.url, payload, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
        });

        logger.info('Outgoing webhook fired', { webhookId: config.id, channelId: message.channelId });
      } catch (err) {
        logger.warn('Outgoing webhook failed', { webhookId: config.id, err });
      }
    });

    await Promise.allSettled(firePromises);
  } catch (err) {
    logger.error('processOutgoingWebhooks error', { err });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function postToChannel(
  channelId: string,
  tenantId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await axios.post(
    `${CHAT_SERVICE_URL}/messages`,
    {
      channelId,
      tenantId,
      content,
      isBot: true,
      botName: 'SlashBot',
      metadata,
    },
    { headers: { 'x-service-secret': SERVICE_SECRET } }
  );
}

// ─── Built-in bot classes ─────────────────────────────────────────────────────

export class PollBot {
  async handle(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    return handlePoll(args, context);
  }
}

export class ReminderBot {
  async handle(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    return handleRemind(args, context);
  }
}

export class StandupBot {
  async handle(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    return handleStandup(args, context);
  }
}
