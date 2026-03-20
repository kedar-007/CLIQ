'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { format, formatDuration, intervalToDuration, parseISO } from 'date-fns';
import {
  Phone,
  Video,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Users,
  X,
  Plus,
  Mic,
  MicOff,
  VideoIcon,
  VideoOff,
  ExternalLink,
} from 'lucide-react';
import { cn, fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { CallSession, CallType } from '@comms/types';

type CallDirection = 'INCOMING' | 'OUTGOING' | 'MISSED';

interface CallHistoryItem extends CallSession {
  direction: CallDirection;
  participants?: { id: string; name: string; avatarUrl?: string }[];
  channelName?: string;
  duration?: number;
}

interface ActiveCall {
  id: string;
  type: CallType;
  channelId?: string;
  channelName?: string;
  participantCount: number;
  startedAt: string;
}

function formatCallDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  if (duration.hours && duration.hours > 0) {
    return `${duration.hours}h ${duration.minutes}m`;
  }
  if (duration.minutes && duration.minutes > 0) {
    return `${duration.minutes}m ${duration.seconds}s`;
  }
  return `${duration.seconds}s`;
}

const DIRECTION_CONFIG: Record<
  CallDirection,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  INCOMING: {
    label: 'Incoming',
    icon: <PhoneIncoming className="w-4 h-4" />,
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  OUTGOING: {
    label: 'Outgoing',
    icon: <PhoneOutgoing className="w-4 h-4" />,
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  MISSED: {
    label: 'Missed',
    icon: <PhoneMissed className="w-4 h-4" />,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

export default function CallsPage() {
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);
  const [callForm, setCallForm] = useState({
    channelId: '',
    emails: '',
    type: 'VIDEO' as 'VIDEO' | 'AUDIO',
  });

  const user = useAuthStore((s) => s.user);

  const { data: activeCallsData } = useQuery({
    queryKey: ['calls', 'active'],
    queryFn: async () => {
      const res = await fetchApi<{ success: boolean; data: ActiveCall[] }>('/api/calls/active');
      return res.data ?? [];
    },
    refetchInterval: 30_000,
  });

  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['calls', 'history'],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await fetchApi<{
        success: boolean;
        data: CallHistoryItem[];
        nextCursor?: string;
      }>(`/api/calls/history?${params}`);
      return { calls: res.data ?? [], nextCursor: res.nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });

  const startCallMutation = useMutation({
    mutationFn: async (form: typeof callForm) => {
      const body: Record<string, unknown> = { type: form.type };
      if (form.channelId.trim()) {
        body.channelId = form.channelId.trim();
      } else if (form.emails.trim()) {
        body.userEmails = form.emails
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);
      }
      const res = await fetchApi<{ success: boolean; data: { roomId: string; token: string } }>(
        '/api/calls/start',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setShowStartCallDialog(false);
      window.open(`/call/${data.roomId}?token=${data.token}`, '_blank');
    },
  });

  const activeCalls = activeCallsData ?? [];
  const historyItems = historyData?.pages.flatMap((p) => p.calls) ?? [];

  const CallTypeIcon = ({ type, className }: { type: CallType; className?: string }) => {
    if (type === 'AUDIO')
      return <Phone className={cn('w-4 h-4', className)} />;
    return <Video className={cn('w-4 h-4', className)} />;
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Calls</h1>
        <button
          onClick={() => setShowStartCallDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Start Call
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Active Calls Section */}
        {activeCalls.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Active Calls ({activeCalls.length})
            </h2>
            <div className="space-y-2">
              {activeCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl"
                >
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600">
                    {call.type === 'AUDIO' ? (
                      <Phone className="w-5 h-5" />
                    ) : (
                      <Video className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {call.channelName ?? 'Direct Call'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {call.participantCount} participant
                      {call.participantCount !== 1 ? 's' : ''} · Started{' '}
                      {format(parseISO(call.startedAt), 'h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                    <a
                      href={`/call/${call.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Join
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Call History */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recent Calls
          </h2>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="text-5xl mb-4">📞</div>
              <p className="font-medium">No calls yet</p>
              <p className="text-sm mt-1">Start a call to connect with your team</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {historyItems.map((call) => {
                const direction = call.direction ?? 'OUTGOING';
                const dirConfig = DIRECTION_CONFIG[direction];
                const durationSeconds = call.duration ?? (
                  call.endedAt
                    ? Math.floor(
                        (new Date(call.endedAt).getTime() -
                          new Date(call.startedAt).getTime()) /
                          1000
                      )
                    : 0
                );
                const callerName =
                  call.channelName ??
                  call.participants?.find((p) => p.id !== user?.id)?.name ??
                  'Unknown';
                const callerAvatar = call.participants?.find((p) => p.id !== user?.id)?.avatarUrl;

                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {callerAvatar ? (
                        <img
                          src={callerAvatar}
                          alt={callerName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">
                          {callerName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {callerName}
                        </p>
                        <span
                          className={cn(
                            'flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                            dirConfig.badgeClass
                          )}
                        >
                          {dirConfig.icon}
                          {dirConfig.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <CallTypeIcon type={call.type} />
                        <span>{call.type === 'AUDIO' ? 'Voice' : 'Video'} call</span>
                        <span>·</span>
                        <span>{formatCallDuration(durationSeconds)}</span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {format(
                          parseISO(
                            call.startedAt instanceof Date
                              ? call.startedAt.toISOString()
                              : String(call.startedAt)
                          ),
                          'MMM d'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(
                          parseISO(
                            call.startedAt instanceof Date
                              ? call.startedAt.toISOString()
                              : String(call.startedAt)
                          ),
                          'h:mm a'
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More */}
          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Start Call Dialog */}
      {showStartCallDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowStartCallDialog(false)}
          />
          <div className="relative bg-card rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">Start a Call</h2>
              <button
                onClick={() => setShowStartCallDialog(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                startCallMutation.mutate(callForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Channel ID
                </label>
                <input
                  type="text"
                  placeholder="Enter channel ID (optional)"
                  value={callForm.channelId}
                  onChange={(e) =>
                    setCallForm((p) => ({ ...p, channelId: e.target.value, emails: '' }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  User Emails
                </label>
                <input
                  type="text"
                  placeholder="user@example.com, user2@example.com"
                  value={callForm.emails}
                  onChange={(e) =>
                    setCallForm((p) => ({ ...p, emails: e.target.value, channelId: '' }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Audio / Video Toggle */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Call Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCallForm((p) => ({ ...p, type: 'AUDIO' }))}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                      callForm.type === 'AUDIO'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    <Mic className="w-4 h-4" />
                    Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallForm((p) => ({ ...p, type: 'VIDEO' }))}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                      callForm.type === 'VIDEO'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    <VideoIcon className="w-4 h-4" />
                    Video
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowStartCallDialog(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    startCallMutation.isPending ||
                    (!callForm.channelId.trim() && !callForm.emails.trim())
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {callForm.type === 'VIDEO' ? (
                    <VideoIcon className="w-4 h-4" />
                  ) : (
                    <Phone className="w-4 h-4" />
                  )}
                  {startCallMutation.isPending ? 'Starting...' : 'Start Call'}
                </button>
              </div>

              {startCallMutation.isError && (
                <p className="text-xs text-red-500 text-center">
                  {startCallMutation.error instanceof Error
                    ? startCallMutation.error.message
                    : 'Failed to start call'}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
