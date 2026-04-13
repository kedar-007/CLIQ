'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, MessageSquare, Reply, Sparkles } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { EmptyWorkspaceState, FloatingHeader } from '@/components/workspace/dsv-shell';

const preferenceRows = [
  { id: '1', label: '# executive-briefing', helper: 'All messages, mentions, and replies' },
  { id: '2', label: 'Aisha Patel', helper: 'Direct messages and call alerts' },
  { id: '3', label: '# daily-updates', helper: 'Mentions only' },
];

export default function NotificationsPage() {
  const { notifications, markAllAsRead, unreadCount } = useNotifications('all', true);

  const grouped = notifications.reduce<Record<string, typeof notifications>>((acc, notification) => {
    const date = new Date(notification.createdAt);
    const today = new Date();
    const diff = today.getTime() - date.getTime();
    const dayMs = 1000 * 60 * 60 * 24;
    const key = diff < dayMs ? 'Today' : diff < dayMs * 2 ? 'Yesterday' : 'This Week';
    if (!acc[key]) acc[key] = [];
    acc[key].push(notification);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <FloatingHeader
        title="Notifications"
        subtitle="Stay on top of mentions, direct replies, call invites, and system alerts."
        actions={
          <button
            onClick={() => markAllAsRead()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          {notifications.length === 0 ? (
            <EmptyWorkspaceState
              title="All caught up"
              description="Unread notifications, call requests, and direct mentions will appear here as your team collaborates."
            />
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="dsv-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                  <h2 className="text-lg font-semibold">{group}</h2>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    {items.length} items
                  </span>
                </div>
                <div className="divide-y divide-border/70">
                  {items.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/30 ${
                        notification.isRead ? '' : 'border-l-2 border-l-primary bg-primary/[0.03]'
                      }`}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        {notification.type.includes('CALL') ? (
                          <Bell className="h-5 w-5" />
                        ) : notification.type.includes('REACTION') ? (
                          <Sparkles className="h-5 w-5" />
                        ) : notification.type.includes('REPLY') ? (
                          <Reply className="h-5 w-5" />
                        ) : (
                          <MessageSquare className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-muted px-2 py-1">{notification.channelId || 'Workspace'}</span>
                              <span>{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</span>
                            </div>
                          </div>
                          <button className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/20 hover:text-primary">
                            Jump to
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <aside className="space-y-5">
          <div className="dsv-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Summary</p>
            <h2 className="mt-2 text-lg font-semibold">Notification health</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Unread alerts</p>
                <p className="mt-1 text-3xl font-semibold">{unreadCount}</p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Priority mentions</p>
                <p className="mt-1 text-3xl font-semibold">
                  {notifications.filter((item) => item.type === 'MESSAGE_MENTION').length}
                </p>
              </div>
            </div>
          </div>

          <div className="dsv-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Preferences</p>
            <h2 className="mt-2 text-lg font-semibold">Tune your alerting</h2>
            <div className="mt-4 space-y-3">
              {preferenceRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/35 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.helper}</p>
                  </div>
                  <button className="h-6 w-11 rounded-full bg-primary/15 p-1 transition-colors">
                    <span className="block h-4 w-4 translate-x-5 rounded-full bg-primary" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
