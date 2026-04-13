'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  ArrowUpRight,
  PhoneCall,
  Phone,
  Video,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  X,
  Plus,
  Mic,
  VideoIcon,
  ExternalLink,
} from 'lucide-react';
import { cn, fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { CallJoinConfig, CallSession, CallType } from '@comms/types';
import { FloatingHeader, PresenceAvatar, ScreenSection } from '@/components/workspace/dsv-shell';
import { CallOverlay } from '@/components/chat/call-overlay';

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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
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

function formatFriendlyName(name?: string | null, email?: string | null) {
  const cleanName = name?.trim();
  if (cleanName) return cleanName;
  if (email) return email.split('@')[0];
  return 'Unknown teammate';
}

export default function CallsPage() {
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);
  const [activeCall, setActiveCall] = useState<CallJoinConfig | null>(null);
  const [callForm, setCallForm] = useState({
    channelId: '',
    emails: '',
    type: 'VIDEO' as 'VIDEO' | 'AUDIO',
  });

  const user = useAuthStore((s) => s.user);
  const { members } = useWorkspaceStore();
  const selectableMembers = useMemo(
    () => members.filter((member) => member.id !== user?.id && !member.isDeactivated),
    [members, user?.id]
  );

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
      const res = await fetchApi<{ success: boolean; data: CallJoinConfig }>(
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
      setActiveCall(data);
    },
  });

  const activeCalls = activeCallsData ?? [];
  const historyItems = historyData?.pages.flatMap((p) => p.calls) ?? [];

  const getCallDisplayName = (call: CallHistoryItem) => {
    if (call.channelName?.trim()) return call.channelName;

    const others =
      call.participants
        ?.filter((participant) => participant.id !== user?.id)
        .map((participant) => formatFriendlyName(participant.name))
        .filter(Boolean) ?? [];

    if (others.length > 0) return others.slice(0, 3).join(', ');
    return 'Workspace call';
  };

  const CallTypeIcon = ({ type, className }: { type: CallType; className?: string }) => {
    if (type === 'AUDIO')
      return <Phone className={cn('w-4 h-4', className)} />;
    return <Video className={cn('w-4 h-4', className)} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <FloatingHeader
        title="Calls"
        subtitle="Voice huddles, video rooms, and recent conversations across your workspace."
        sticky={false}
        actions={
          <button
            onClick={() => setShowStartCallDialog(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(26,86,219,0.16)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Start Call
          </button>
        }
      />

      <div className="dsv-scroll flex-1 space-y-5 overflow-y-auto">
        {activeCalls.length > 0 && (
          <ScreenSection
            eyebrow="Live now"
            title={`Active calls${activeCalls.length > 1 ? ` (${activeCalls.length})` : ''}`}
            description="Jump back into any live room with one click."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {activeCalls.map((call) => (
                <div
                  key={call.id}
                  className="dsv-card dsv-card-hover flex items-center gap-4 p-5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0E9F6E]/12 text-[#0E9F6E]">
                    {call.type === 'AUDIO' ? (
                      <Phone className="w-5 h-5" />
                    ) : (
                      <Video className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {call.channelName ?? 'Direct call'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {call.participantCount} participant
                      {call.participantCount !== 1 ? 's' : ''} · Started{' '}
                      {format(parseISO(call.startedAt), 'h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#0E9F6E]/10 px-2.5 py-1 text-xs font-medium text-[#0E9F6E]">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                    <a
                      href={`/call/${call.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/20 hover:text-primary dark:bg-slate-950/50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Join
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </ScreenSection>
        )}

        <ScreenSection
          eyebrow="History"
          title="Recent calls"
          description="A cleaner timeline of huddles, check-ins, and missed conversations."
        >

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="dsv-card flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A56DB]/10 text-primary">
                <PhoneCall className="h-6 w-6" />
              </div>
              <p className="font-medium">No calls yet</p>
              <p className="mt-1 text-sm">Start a call to connect with your team.</p>
            </div>
          ) : (
            <div className="dsv-card overflow-hidden">
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
                const otherParticipant = call.participants?.find((p) => p.id !== user?.id);
                const callerName = getCallDisplayName(call);
                const callerAvatar = otherParticipant?.avatarUrl;

                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-4 border-b border-border/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/25"
                  >
                    <PresenceAvatar
                      name={callerName}
                      src={callerAvatar}
                      status={direction === 'MISSED' ? 'DND' : 'ONLINE'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {callerName}
                        </p>
                        <span
                          className={cn(
                            'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                            dirConfig.badgeClass
                          )}
                        >
                          {dirConfig.icon}
                          {dirConfig.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <CallTypeIcon type={call.type} />
                        <span>{call.type === 'AUDIO' ? 'Voice' : 'Video'} call</span>
                        <span>·</span>
                        <span>{formatCallDuration(durationSeconds)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <button className="hidden rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-primary md:inline-flex">
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                      <div className="text-right">
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
                  </div>
                );
              })}
            </div>
          )}

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
        </ScreenSection>
      </div>

      {showStartCallDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
            onClick={() => setShowStartCallDialog(false)}
          />
          <div className="relative mx-4 w-full max-w-md rounded-[24px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Add one or many teammate emails separated by commas.
                </p>
                {selectableMembers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectableMembers.slice(0, 8).map((member) => {
                      const selectedEmails = callForm.emails
                        .split(',')
                        .map((email) => email.trim().toLowerCase())
                        .filter(Boolean);
                      const isSelected = selectedEmails.includes(member.email.toLowerCase());
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedEmails);
                            if (isSelected) {
                              next.delete(member.email.toLowerCase());
                            } else {
                              next.add(member.email.toLowerCase());
                            }
                            setCallForm((prev) => ({
                              ...prev,
                              channelId: '',
                              emails: [...next].join(', '),
                            }));
                          }}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            isSelected
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <span>{member.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
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
      {activeCall ? <CallOverlay config={activeCall} onLeave={() => setActiveCall(null)} participants={[]} /> : null}
    </div>
  );
}
