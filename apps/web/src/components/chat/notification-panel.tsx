'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell, Check, MessageSquare, AtSign, Hash, Smile, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNotifications, type NotificationFilter } from '@/hooks/use-notifications';
import type { Notification, NotificationType } from '@comms/types';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

const FILTER_TABS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'dms', label: 'DMs' },
  { key: 'reactions', label: 'Reactions' },
];

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'MESSAGE_MENTION':
    case 'KEYWORD_ALERT':
      return <AtSign className="w-3.5 h-3.5" />;
    case 'MESSAGE_REPLY':
      return <MessageSquare className="w-3.5 h-3.5" />;
    case 'REACTION_ADDED':
      return <Smile className="w-3.5 h-3.5" />;
    case 'CHANNEL_INVITE':
      return <Hash className="w-3.5 h-3.5" />;
    default:
      return <Bell className="w-3.5 h-3.5" />;
  }
}

function getNotificationIconBg(type: NotificationType): string {
  switch (type) {
    case 'MESSAGE_MENTION':
    case 'KEYWORD_ALERT':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'REACTION_ADDED':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'CHANNEL_INVITE':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    default:
      return 'bg-primary/10 text-primary';
  }
}

function getNavigationTarget(notification: Notification): string {
  if (notification.channelId && notification.messageId) {
    return `/${notification.channelId}?messageId=${notification.messageId}`;
  }
  if (notification.channelId) {
    return `/${notification.channelId}`;
  }
  if (notification.taskId) {
    return `/tasks/${notification.taskId}`;
  }
  return '/';
}

interface NotificationItemProps {
  notification: Notification;
  onNavigate: (notification: Notification) => void;
}

function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  const timeAgo = notification.createdAt
    ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
    : '';

  return (
    <button
      onClick={() => onNavigate(notification)}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        notification.isRead ? 'hover:bg-accent/40' : 'bg-primary/5 hover:bg-primary/10'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
          getNotificationIconBg(notification.type)
        )}
      >
        {getNotificationIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{notification.title}</p>
        {notification.body && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{notification.body}</p>
        )}
        <p className="text-xs text-muted-foreground/70 mt-1">{timeAgo}</p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
      )}
    </button>
  );
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    markAsRead,
    markAllAsRead,
  } = useNotifications(activeFilter);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleNavigate = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        markAsRead([notification.id]);
      }
      const target = getNavigationTarget(notification);
      router.push(target);
      onClose();
    },
    [markAsRead, router, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-96 bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-foreground" />
            <h2 className="font-semibold text-sm">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium min-w-[20px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Mark all as read"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium transition-colors border-b-2',
                activeFilter === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3 pt-1">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-muted rounded animate-pulse w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length > 0 ? (
            <>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onNavigate={handleNavigate}
                />
              ))}

              {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              )}

              {!hasNextPage && notifications.length > 5 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  You&apos;ve seen all notifications.
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Bell className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {activeFilter === 'all' ? "You're all caught up!" : `No ${activeFilter} notifications`}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeFilter === 'all'
                  ? 'New notifications will appear here.'
                  : activeFilter === 'mentions'
                  ? 'Mentions and keyword alerts will appear here.'
                  : activeFilter === 'dms'
                  ? 'Direct message notifications will appear here.'
                  : 'Reaction notifications will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
