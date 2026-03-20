'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '@/store/chat.store';
import { useSocket } from './use-socket';
import { fetchApi } from '@/lib/utils';
import { useEffect } from 'react';

interface Message {
  id: string;
  content: string;
  userId: string;
  channelId: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  threadId?: string | null;
  user?: { id: string; name: string; avatarUrl?: string };
  attachments?: unknown[];
  reactions?: Array<{ emoji: string; count: number; userIds: string[] }>;
  replyCount?: number;
}

export function useMessages(channelId: string) {
  const { emit } = useSocket();
  const queryClient = useQueryClient();

  // Real-time messages from Zustand store
  const realtimeMessages = useChatStore(s => s.messages[channelId] ?? []);
  const addMessage = useChatStore(s => s.addMessage);
  const updateMessage = useChatStore(s => s.updateMessage);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await fetchApi<{ messages: Message[]; nextCursor?: string }>(
        `/api/chat/messages/${channelId}?${params}`
      );
      return res;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
  });

  // Combine historical + realtime, deduplicate by id
  const historicalMessages = data?.pages.flatMap(p => p.messages) ?? [];
  const historicalIds = new Set(historicalMessages.map(m => m.id));
  const newRealtimeMessages = realtimeMessages.filter(m => !historicalIds.has(m.id));
  const allMessages = [...historicalMessages, ...newRealtimeMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const sendMessage = (content: string, attachments?: unknown[]) => {
    emit('message:send', { channelId, content, attachments });
  };

  const editMessage = (messageId: string, content: string) => {
    emit('message:edit', { messageId, content });
  };

  const deleteMessage = (messageId: string) => {
    emit('message:delete', { messageId });
  };

  const reactToMessage = (messageId: string, emoji: string) => {
    emit('message:react', { messageId, emoji });
  };

  const replyToMessage = (messageId: string, content: string) => {
    emit('message:send', { channelId, content, threadId: messageId });
  };

  return {
    messages: allMessages,
    fetchMore: fetchNextPage,
    hasMore: !!hasNextPage,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    replyToMessage,
  };
}
