'use client';

import { useState, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/lib/utils';
import type { Notification, NotificationType } from '@comms/types';

export type NotificationFilter = 'all' | 'mentions' | 'dms' | 'reactions';

const MENTION_TYPES: NotificationType[] = ['MESSAGE_MENTION', 'KEYWORD_ALERT'];
const DM_TYPES: NotificationType[] = ['MESSAGE_REPLY', 'CHANNEL_INVITE'];
const REACTION_TYPES: NotificationType[] = ['REACTION_ADDED'];

interface NotificationsPage {
  success: boolean;
  data: Notification[];
  meta: {
    unreadCount: number;
    hasMore: boolean;
  };
}

function filterTypesByTab(filter: NotificationFilter): NotificationType[] | undefined {
  switch (filter) {
    case 'mentions':
      return MENTION_TYPES;
    case 'dms':
      return DM_TYPES;
    case 'reactions':
      return REACTION_TYPES;
    default:
      return undefined;
  }
}

export function useNotifications(filter: NotificationFilter = 'all') {
  const queryClient = useQueryClient();
  const types = filterTypesByTab(filter);

  const buildUrl = (cursor?: string) => {
    const params = new URLSearchParams({ limit: '30' });
    if (cursor) params.set('cursor', cursor);
    if (types) types.forEach((t) => params.append('type', t));
    return `/api/notifications?${params.toString()}`;
  };

  const query = useInfiniteQuery<NotificationsPage>({
    queryKey: ['notifications', filter],
    queryFn: ({ pageParam }) =>
      fetchApi<NotificationsPage>(buildUrl(pageParam as string | undefined)),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.meta.hasMore) return undefined;
      const allNotifications = allPages.flatMap((p) => p.data);
      const last = allNotifications[allNotifications.length - 1];
      return last?.createdAt ? new Date(last.createdAt).toISOString() : undefined;
    },
    initialPageParam: undefined,
    staleTime: 30_000,
  });

  const notifications = query.data?.pages.flatMap((p) => p.data) ?? [];
  const unreadCount = query.data?.pages[0]?.meta.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) =>
      fetchApi('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (_data, ids) => {
      queryClient.setQueriesData<any>({ queryKey: ['notifications'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: NotificationsPage) => ({
            ...page,
            data: page.data.map((n: Notification) =>
              ids.includes(n.id) ? { ...n, isRead: true, readAt: new Date() } : n
            ),
            meta: {
              ...page.meta,
              unreadCount: Math.max(0, page.meta.unreadCount - ids.filter((id) => {
                const notif = page.data.find((n) => n.id === id);
                return notif && !notif.isRead;
              }).length),
            },
          })),
        };
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueriesData<any>({ queryKey: ['notifications'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: NotificationsPage) => ({
            ...page,
            data: page.data.map((n: Notification) => ({ ...n, isRead: true, readAt: new Date() })),
            meta: { ...page.meta, unreadCount: 0 },
          })),
        };
      });
    },
  });

  const markAsRead = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) markReadMutation.mutate(ids);
    },
    [markReadMutation]
  );

  const markAllAsRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    markAsRead,
    markAllAsRead,
    refetch: query.refetch,
  };
}
