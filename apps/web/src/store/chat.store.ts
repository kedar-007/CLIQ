import { create } from 'zustand';
import type { Message, Channel, ChannelMember } from '@comms/types';

interface TypingUser {
  userId: string;
  name: string;
  avatarUrl?: string;
  channelId: string;
}

interface ChatState {
  // Channels
  channels: Channel[];
  activeChannelId: string | null;
  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (channelId: string | null) => void;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;

  // Messages
  messages: Record<string, Message[]>;
  setMessages: (channelId: string, messages: Message[]) => void;
  prependMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  updateMessageReactions: (channelId: string, messageId: string, reactions: any[]) => void;

  // Typing
  typingUsers: Record<string, TypingUser[]>;
  setTypingUser: (channelId: string, user: TypingUser, isTyping: boolean) => void;

  // Unread counts
  unreadCounts: Record<string, number>;
  setUnreadCount: (channelId: string, count: number) => void;
  clearUnread: (channelId: string) => void;

  // Thread
  activeThreadMessageId: string | null;
  setActiveThread: (messageId: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  activeThreadMessageId: null,

  setChannels: (channels) => set({ channels }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  updateChannel: (channelId, updates) =>
    set((state) => ({
      channels: state.channels.map((c) => (c.id === channelId ? { ...c, ...updates } : c)),
    })),

  setMessages: (channelId, messages) =>
    set((state) => ({ messages: { ...state.messages, [channelId]: messages } })),

  prependMessages: (channelId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...messages, ...(state.messages[channelId] || [])],
      },
    })),

  addMessage: (channelId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), message],
      },
    })),

  updateMessage: (channelId, messageId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),

  deleteMessage: (channelId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, deletedAt: new Date() } : m
        ),
      },
    })),

  updateMessageReactions: (channelId, messageId, reactions) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        ),
      },
    })),

  setTypingUser: (channelId, user, isTyping) =>
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      const without = current.filter((u) => u.userId !== user.userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: isTyping ? [...without, user] : without,
        },
      };
    }),

  setUnreadCount: (channelId, count) =>
    set((state) => ({ unreadCounts: { ...state.unreadCounts, [channelId]: count } })),

  clearUnread: (channelId) =>
    set((state) => ({ unreadCounts: { ...state.unreadCounts, [channelId]: 0 } })),

  setActiveThread: (messageId) => set({ activeThreadMessageId: messageId }),
}));
