import { create } from 'zustand';
import type { Channel, Message } from '@comms/types';

interface TypingUser {
  userId: string;
  name: string;
  avatarUrl?: string;
}

interface ChatState {
  channels: Channel[];
  messages: Record<string, Message[]>;
  activeChannelId: string | null;
  typingUsers: Record<string, TypingUser[]>;
  unreadCounts: Record<string, number>;
  lastReadTimestamps: Record<string, string>;
}

interface ChatActions {
  setChannels: (channels: Channel[]) => void;
  upsertChannel: (channel: Channel) => void;
  removeChannel: (channelId: string) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  prependMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, messageId: string, partial: Partial<Message>) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  setActiveChannel: (channelId: string | null) => void;
  setTypingUser: (channelId: string, user: TypingUser, isTyping: boolean) => void;
  setUnreadCount: (channelId: string, count: number) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  setLastRead: (channelId: string, messageId: string) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()((set) => ({
  channels: [],
  messages: {},
  activeChannelId: null,
  typingUsers: {},
  unreadCounts: {},
  lastReadTimestamps: {},

  setChannels: (channels) => set({ channels }),

  upsertChannel: (channel) =>
    set((state) => {
      const existing = state.channels.findIndex((c) => c.id === channel.id);
      if (existing >= 0) {
        const updated = [...state.channels];
        updated[existing] = { ...updated[existing], ...channel };
        return { channels: updated };
      }
      return { channels: [channel, ...state.channels] };
    }),

  removeChannel: (channelId) =>
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
    })),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [channelId]: messages },
    })),

  prependMessages: (channelId, messages) =>
    set((state) => {
      const existing = state.messages[channelId] ?? [];
      return {
        messages: {
          ...state.messages,
          [channelId]: [...messages, ...existing],
        },
      };
    }),

  addMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messages[channelId] ?? [];
      return {
        messages: {
          ...state.messages,
          [channelId]: [...existing, message],
        },
      };
    }),

  updateMessage: (channelId, messageId, partial) =>
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return {};
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) => (m.id === messageId ? { ...m, ...partial } : m)),
        },
      };
    }),

  deleteMessage: (channelId, messageId) =>
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return {};
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId ? { ...m, deletedAt: new Date() } : m,
          ),
        },
      };
    }),

  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  setTypingUser: (channelId, user, isTyping) =>
    set((state) => {
      const current = state.typingUsers[channelId] ?? [];
      const filtered = current.filter((u) => u.userId !== user.userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: isTyping ? [...filtered, user] : filtered,
        },
      };
    }),

  setUnreadCount: (channelId, count) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: count },
    })),

  incrementUnread: (channelId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] ?? 0) + 1,
      },
    })),

  clearUnread: (channelId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    })),

  setLastRead: (channelId, messageId) =>
    set((state) => ({
      lastReadTimestamps: { ...state.lastReadTimestamps, [channelId]: messageId },
    })),
}));
