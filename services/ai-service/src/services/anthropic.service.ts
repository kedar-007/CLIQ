import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@comms/logger';

const logger = createLogger('ai-service:anthropic');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

export async function summarizeThread(messages: { sender: string; content: string; timestamp: string }[]): Promise<string> {
  const transcript = messages
    .map((m) => `[${m.timestamp}] ${m.sender}: ${m.content}`)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Please provide a concise summary of this conversation thread. Include key decisions, action items, and important points. Format with clear sections:\n\n${transcript}`,
    }],
  });

  return (response.content[0] as any).text;
}

export async function generateMeetingNotes(transcript: string): Promise<{
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
}> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Analyze this meeting transcript and extract structured information. Return valid JSON only:
{
  "summary": "2-3 sentence overview",
  "keyPoints": ["point 1", "point 2", ...],
  "actionItems": ["action 1 (assigned to: person)", ...],
  "decisions": ["decision 1", ...]
}

Transcript:
${transcript}`,
    }],
  });

  try {
    const text = (response.content[0] as any).text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { summary: text, keyPoints: [], actionItems: [], decisions: [] };
  } catch {
    return { summary: (response.content[0] as any).text, keyPoints: [], actionItems: [], decisions: [] };
  }
}

export async function generateSmartReplies(
  conversationContext: string,
  lastMessage: string
): Promise<string[]> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Given this conversation context and the last message, generate exactly 3 short, natural reply suggestions (10 words or fewer each). Return as JSON array only: ["reply1", "reply2", "reply3"]\n\nContext: ${conversationContext}\n\nLast message: "${lastMessage}"`,
    }],
  });

  try {
    const text = (response.content[0] as any).text;
    const arr = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
    return arr.slice(0, 3);
  } catch {
    return ['Sure!', 'Got it.', 'Thanks!'];
  }
}

export async function improveMessage(
  message: string,
  instruction: 'grammar' | 'shorten' | 'expand' | 'professional' | 'casual'
): Promise<string> {
  const instructionMap = {
    grammar: 'Fix grammar and spelling only, keep the same meaning and tone.',
    shorten: 'Make this message shorter and more concise while keeping the key information.',
    expand: 'Expand this message with more detail and context while keeping the same tone.',
    professional: 'Rewrite this in a professional, formal business tone.',
    casual: 'Rewrite this in a friendly, casual conversational tone.',
  };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `${instructionMap[instruction]} Return only the improved text, no explanation.\n\nOriginal: "${message}"`,
    }],
  });

  return (response.content[0] as any).text.replace(/^["']|["']$/g, '');
}

export async function translateMessage(text: string, targetLanguage: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Translate the following text to ${targetLanguage}. Return only the translation, no explanation:\n\n"${text}"`,
    }],
  });

  return (response.content[0] as any).text.replace(/^["']|["']$/g, '');
}

export async function summarizeFile(content: string, fileName: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Summarize the key information from this document ("${fileName}") in 3-5 bullet points:\n\n${content.slice(0, 10000)}`,
    }],
  });

  return (response.content[0] as any).text;
}

export async function extractActionItems(text: string): Promise<Array<{ title: string; assignee?: string; dueDate?: string }>> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract action items from this text. Return JSON array only: [{"title": "...", "assignee": "person name or null", "dueDate": "ISO date or null"}]\n\nText: "${text}"`,
    }],
  });

  try {
    const text2 = (response.content[0] as any).text;
    const arr = JSON.parse(text2.match(/\[[\s\S]*\]/)?.[0] || '[]');
    return arr;
  } catch {
    return [];
  }
}

export async function analyzeStandupResponses(responses: { user: string; response: string }[]): Promise<string> {
  const formatted = responses.map((r) => `${r.user}: ${r.response}`).join('\n\n');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Summarize these standup responses for the team manager. Group by themes, highlight blockers, and list completed work:\n\n${formatted}`,
    }],
  });

  return (response.content[0] as any).text;
}
