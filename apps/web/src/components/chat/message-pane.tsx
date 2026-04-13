'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  CalendarDays,
  CheckSquare2,
  FileText,
  Hash,
  Info,
  Loader2,
  Lock,
  Phone,
  Pin,
  Play,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react';
import { fetchApi, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { CallJoinConfig, Message } from '@comms/types';
import { AvatarStack, PresenceAvatar } from '@/components/workspace/dsv-shell';
import { CallOverlay } from './call-overlay';
import { MembersPanel } from './members-panel';
import { MessageComposer } from './message-composer';
import { MessageItem } from './message-item';
import { InviteModal } from './invite-modal';

interface MessagePaneProps {
  channelId: string;
  isFocused?: boolean;
  compact?: boolean;
  onFocus?: () => void;
  onClose?: () => void;
}

function CallBanner({ people }: { people: Array<{ id: string; name: string; avatarUrl?: string; status?: string }> }) {
  const visible = people.slice(0, 3);

  return (
    <div className="rounded-[24px] border border-[#1A56DB]/12 bg-[linear-gradient(135deg,rgba(26,86,219,0.10),rgba(124,58,237,0.07))] p-4 shadow-[0_14px_30px_rgba(26,86,219,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Live huddle</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Product sync in progress</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Jump back into the video room, share a screen, or catch the latest discussion.
          </p>
        </div>
        <button className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(26,86,219,0.20)] transition hover:bg-primary/90">
          <Play className="h-3.5 w-3.5" />
          Rejoin
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <AvatarStack people={visible.map((person) => ({ ...person, status: person.status as any }))} />
        <span className="text-xs text-muted-foreground">
          {people.length > 0 ? `${people.length} teammates active` : 'Waiting for teammates'}
        </span>
      </div>
    </div>
  );
}

function ConversationRail({ people }: { people: Array<{ id: string; name: string; avatarUrl?: string; status?: string }> }) {
  const tasks = [
    { id: '1', label: 'Finalize launch message', due: 'Today · 4:30 PM', done: true },
    { id: '2', label: 'Collect design feedback', due: 'Tomorrow · 10:00 AM', done: false },
    { id: '3', label: 'Prepare client handoff', due: 'Tue · 5:00 PM', done: false },
  ];

  const files = [
    { id: '1', name: 'Launch-plan-v4.fig', meta: 'Figma file · 12 MB' },
    { id: '2', name: 'Sprint-summary.pdf', meta: 'PDF document · 2.4 MB' },
    { id: '3', name: 'Roadmap-notes.docx', meta: 'Shared link · Updated 1h ago' },
  ];

  return (
    <aside className="hidden w-[292px] shrink-0 border-l border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(248,250,252,0.92))] p-3 xl:block dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.35),rgba(15,23,42,0.75))]">
      <div className="dsv-scroll flex h-full flex-col gap-3 overflow-y-auto">
        <div className="rounded-[24px] border border-border/70 bg-white/86 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950/55">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Project tracker</p>
              <h4 className="mt-1 text-sm font-semibold">About Sofia project</h4>
            </div>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <label
                key={task.id}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-white/78 px-3 py-3 transition hover:border-primary/20 dark:border-white/10 dark:bg-white/5"
              >
                <CheckSquare2 className={`mt-0.5 h-4 w-4 ${task.done ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{task.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{task.due}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-white/86 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950/55">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Files & links</p>
              <h4 className="mt-1 text-sm font-semibold">Shared resources</h4>
            </div>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white/78 px-3 py-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{file.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-white/86 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950/55">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Participants</p>
          <div className="mt-4 space-y-3">
            {people.slice(0, 5).map((person) => (
              <div key={person.id} className="flex items-center gap-3">
                <PresenceAvatar name={person.name} src={person.avatarUrl} status={(person.status as any) || 'ONLINE'} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Available in workspace</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MessagePane({
  channelId,
  isFocused = false,
  compact = false,
  onFocus,
  onClose,
}: MessagePaneProps) {
  const { messages, setMessages, prependMessages, channels, clearUnread, typingUsers, pinnedChannelIds, togglePinnedChannel } = useChatStore();
  const { user } = useAuthStore();
  const { members } = useWorkspaceStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [activeCall, setActiveCall] = useState<CallJoinConfig | null>(null);
  const [callStarting, setCallStarting] = useState(false);

  const channel = channels.find((item) => item.id === channelId);
  const channelMessages = messages[channelId] || [];
  const channelTyping = typingUsers[channelId] || [];

  const isDm = channel?.type === 'DM' || channel?.type === 'GROUP_DM';
  const isPrivate = channel?.type === 'PRIVATE';
  const isAnnouncement = channel?.type === 'ANNOUNCEMENT';
  const Icon = isDm ? AtSign : isPrivate ? Lock : isAnnouncement ? AtSign : Hash;

  const dmOtherMember = isDm
    ? (() => {
        const participantProfiles = channel?.participantProfiles || [];
        const otherParticipant = participantProfiles.find((participant) => participant.id !== user?.id);
        if (otherParticipant) return otherParticipant;
        if (!channel?.name) return null;
        const parts = channel.name.split('-');
        const otherId = parts.find((part) => part !== 'dm' && part !== user?.id);
        if (!otherId) return null;
        return members.find((member) => member.id === otherId) || null;
      })()
    : null;

  const dmDisplayName = dmOtherMember?.name?.trim() || dmOtherMember?.email?.split('@')[0] || null;
  const displayName = isDm && dmOtherMember ? dmDisplayName : channel?.name;
  const introText = isDm
    ? `Private conversation with ${displayName || 'your teammate'}.`
    : channel?.description || channel?.topic || 'Bring your team into focus with rich, organized conversation.';
  const isPinned = pinnedChannelIds.includes(channelId);

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    if (callStarting || activeCall) return;
    setCallStarting(true);
    try {
      const response = await fetchApi<{ success: boolean; data: CallJoinConfig }>('/api/calls/start', {
        method: 'POST',
        body: JSON.stringify({ channelId, type }),
      });
      if (response.success && response.data) setActiveCall(response.data);
    } finally {
      setCallStarting(false);
    }
  };

  useEffect(() => {
    setMessages(channelId, []);
    setNextCursor(null);
    setHasMore(true);
    setIsLoading(true);

    fetchApi<{ success: boolean; data: Message[]; meta: { nextCursor: string; hasMore: boolean } }>(
      `/api/chat/messages/channels/${channelId}/messages?limit=50`
    )
      .then((response) => {
        setMessages(channelId, response.data || []);
        setNextCursor(response.meta?.nextCursor || null);
        setHasMore(response.meta?.hasMore ?? false);
        clearUnread(channelId);
        window.setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
      })
      .catch(() => {
        setMessages(channelId, []);
      })
      .finally(() => setIsLoading(false));
  }, [channelId, clearUnread, setMessages]);

  useEffect(() => {
    const last = channelMessages[channelMessages.length - 1];
    if (last?.senderId === user?.id) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, user?.id]);

  const handleScroll = useCallback(async () => {
    const container = containerRef.current;
    if (!container || isLoadingMore || !hasMore || !nextCursor) return;
    if (container.scrollTop < 120) {
      setIsLoadingMore(true);
      const previousHeight = container.scrollHeight;
      try {
        const response = await fetchApi<{ success: boolean; data: Message[]; meta: { nextCursor: string; hasMore: boolean } }>(
          `/api/chat/messages/channels/${channelId}/messages?limit=50&cursor=${nextCursor}`
        );
        prependMessages(channelId, response.data || []);
        setNextCursor(response.meta?.nextCursor || null);
        setHasMore(response.meta?.hasMore ?? false);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - previousHeight;
        });
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [channelId, hasMore, isLoadingMore, nextCursor, prependMessages]);

  const groupedMessages = channelMessages.map((message, index) => {
    const previous = channelMessages[index - 1];
    const isGrouped =
      previous &&
      previous.senderId === message.senderId &&
      !previous.deletedAt &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
    return { ...message, isGrouped: !!isGrouped };
  });

  const participantPeople = (channel?.participantProfiles || []).map((participant) => ({
    id: participant.id,
    name: participant.name || participant.email,
    avatarUrl: participant.avatarUrl,
    status: participant.status,
  }));

  return (
    <div
      className={cn(
        'flex h-full min-w-0 overflow-hidden rounded-[30px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] transition-all duration-200 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.84))]',
        isFocused
          ? 'border-primary/20 shadow-[0_24px_48px_rgba(26,86,219,0.10)]'
          : 'border-border/70 shadow-[0_12px_30px_rgba(15,23,42,0.06)]'
      )}
      onClick={onFocus}
    >
      <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn('mx-3 mt-3 mb-0', compact ? 'rounded-[24px] border border-border/70 bg-white/92 px-4 py-3 shadow-[0_14px_28px_rgba(15,23,42,0.07)] dark:bg-slate-950/85' : 'dsv-floating-header')}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                {isDm && dmOtherMember ? (
                  <PresenceAvatar name={displayName || 'DM'} src={dmOtherMember.avatarUrl} status={(dmOtherMember.status as any) || 'ONLINE'} />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,rgba(26,86,219,0.14),rgba(124,58,237,0.12))] text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className={cn('truncate font-semibold leading-tight', compact ? 'text-[18px]' : 'text-[22px]')}>
                    {displayName}
                  </h2>
                  <p className={cn('mt-1 truncate text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{introText}</p>
                </div>
              </div>
              {!compact && participantPeople.length > 0 ? (
                <div className="mt-4 flex items-center gap-3">
                  <AvatarStack people={participantPeople} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {participantPeople.length} active in this conversation
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => startCall('AUDIO')}
                disabled={callStarting || !!activeCall}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/90 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary disabled:opacity-50 dark:bg-slate-950/80"
                title="Start audio call"
              >
                <Phone className="h-4 w-4" />
              </button>
              <button
                onClick={() => startCall('VIDEO')}
                disabled={callStarting || !!activeCall}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/90 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary disabled:opacity-50 dark:bg-slate-950/80"
                title="Start video call"
              >
                <Video className="h-4 w-4" />
              </button>
              {!compact ? (
                <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/90 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:bg-slate-950/80">
                  <Search className="h-4 w-4" />
                </button>
              ) : null}
              <button
                onClick={() => togglePinnedChannel(channelId)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/90 transition-colors dark:bg-slate-950/80',
                  isPinned
                    ? 'border-[#7C3AED]/20 text-[#7C3AED]'
                    : 'border-border text-muted-foreground hover:border-primary/20 hover:text-primary'
                )}
              >
                <Pin className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowMembers((current) => !current)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/90 transition-colors dark:bg-slate-950/80',
                  showMembers
                    ? 'border-primary/20 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/20 hover:text-primary'
                )}
              >
                <Users className="h-4 w-4" />
              </button>
              {!compact ? (
                <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/90 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:bg-slate-950/80">
                  <Info className="h-4 w-4" />
                </button>
              ) : null}
              {onClose ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  className={cn(
                    'flex items-center justify-center rounded-2xl border border-border bg-white/90 text-muted-foreground transition-colors hover:border-rose-200 hover:text-rose-500 dark:bg-slate-950/80',
                    compact ? 'h-10 min-w-[44px] px-3 gap-1.5' : 'h-10 w-10'
                  )}
                  title="Close chat"
                >
                  <X className="h-4 w-4" />
                  {compact ? <span className="text-xs font-medium">Close</span> : null}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className="dsv-scroll flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(26,86,219,0.04),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0))] px-4 py-4 dark:bg-none"
          onScroll={handleScroll}
        >
          {!compact ? <CallBanner people={participantPeople} /> : null}

          {isLoadingMore ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {!hasMore && !isLoading && channelMessages.length > 0 ? (
            <div className="mb-6 flex items-start gap-3 rounded-[26px] border border-border/70 bg-[linear-gradient(135deg,rgba(26,86,219,0.06),rgba(255,255,255,0.72))] px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)] dark:bg-muted/25">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground">{displayName}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{introText}</p>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-4 px-2 py-8">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                    <div className="h-16 animate-pulse rounded-2xl bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedMessages.length === 0 ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Start the conversation</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Introduce a project update, share a file, or drop a quick note to get the collaboration rolling.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0 pb-4">
              {groupedMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isGrouped={message.isGrouped}
                  currentUserId={user?.id || ''}
                />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border/70 bg-white/55 px-1 pb-1 backdrop-blur dark:bg-slate-950/35">
          {channelTyping.length > 0 ? (
            <div className="px-4 pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="ml-1">
                  {channelTyping[0].name}
                  {channelTyping.length > 1 ? ` +${channelTyping.length - 1}` : ''} typing…
                </span>
              </span>
            </div>
          ) : null}

          <MessageComposer
            channelId={channelId}
            channelName={displayName || channel?.name}
            isDirectMessage={isDm}
            compact={compact}
          />
        </div>
      </div>
      {!compact ? <ConversationRail people={participantPeople} /> : null}
      </div>

      {showMembers ? (
        <MembersPanel
          channelId={channelId}
          channelName={displayName || channel?.name}
          onClose={() => setShowMembers(false)}
          onInvite={() => setShowInvite(true)}
        />
      ) : null}
      {showInvite ? <InviteModal onClose={() => setShowInvite(false)} /> : null}
      {activeCall ? <CallOverlay config={activeCall} onLeave={() => setActiveCall(null)} participants={[]} /> : null}
    </div>
  );
}
