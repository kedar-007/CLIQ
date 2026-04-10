'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { MessageItem } from './message-item';
import { MessageComposer } from './message-composer';
import { MembersPanel } from './members-panel';
import { InviteModal } from './invite-modal';
import { CallOverlay } from './call-overlay';
import { fetchApi, cn } from '@/lib/utils';
import type { CallJoinConfig, Message } from '@comms/types';
import {
  Hash, Loader2, Users, Search, Phone, Video,
  Pin, Info, Lock, AtSign, X
} from 'lucide-react';

interface MessagePaneProps {
  channelId: string;
  isFocused?: boolean;
  onFocus?: () => void;
  onClose?: () => void;
}

export function MessagePane({ channelId, isFocused = false, onFocus, onClose }: MessagePaneProps) {
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

  const channel = channels.find(c => c.id === channelId);
  const channelMessages = messages[channelId] || [];
  const channelTyping = typingUsers[channelId] || [];

  const isDm = channel?.type === 'DM' || channel?.type === 'GROUP_DM';
  const isPrivate = channel?.type === 'PRIVATE';
  const isAnnouncement = channel?.type === 'ANNOUNCEMENT';
  const Icon = isDm ? AtSign : isPrivate ? Lock : isAnnouncement ? AtSign : Hash;

  // For DM channels, find the other person's name/avatar
  const dmOtherMember = isDm ? (() => {
    const participantProfiles = channel?.participantProfiles || [];
    const otherParticipant = participantProfiles.find((participant) => participant.id !== user?.id);
    if (otherParticipant) return otherParticipant;

    if (!channel?.name) return null;
    const parts = channel.name.split('-');
    const otherId = parts.find((p: string) => p !== 'dm' && p !== user?.id);
    if (!otherId) return null;
    return members.find(m => m.id === otherId) || null;
  })() : null;

  const dmDisplayName = dmOtherMember?.name?.trim() || dmOtherMember?.email?.split('@')[0] || null;
  const displayName = isDm && dmOtherMember ? dmDisplayName : channel?.name;
  const displayInitials = dmDisplayName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const introTitle = isDm ? displayName : `# ${displayName || channel?.name || 'channel'}`;
  const introText = isDm
    ? `This is the beginning of your conversation with ${displayName || 'this teammate'}.`
    : `This is the beginning of the #${displayName || channel?.name} channel.`;
  const isPinned = pinnedChannelIds.includes(channelId);

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    if (callStarting || activeCall) return;
    setCallStarting(true);
    try {
      const res = await fetchApi<{ success: boolean; data: CallJoinConfig }>(
        '/api/calls/start',
        { method: 'POST', body: JSON.stringify({ channelId, type }) }
      );
      if (res.success && res.data) {
        setActiveCall(res.data);
      }
    } catch {
      // silent fail — call couldn't be started
    } finally {
      setCallStarting(false);
    }
  };

  // Initial load
  useEffect(() => {
    setMessages(channelId, []);
    setNextCursor(null);
    setHasMore(true);
    setIsLoading(true);

    fetchApi<{ success: boolean; data: Message[]; meta: { nextCursor: string; hasMore: boolean } }>(
      `/api/chat/messages/channels/${channelId}/messages?limit=50`
    ).then(res => {
      setMessages(channelId, res.data || []);
      setNextCursor(res.meta?.nextCursor || null);
      setHasMore(res.meta?.hasMore ?? false);
      clearUnread(channelId);
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
    }).catch(() => {
      setMessages(channelId, []);
    }).finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Auto-scroll on own new messages
  useEffect(() => {
    const last = channelMessages[channelMessages.length - 1];
    if (last?.senderId === user?.id) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, user?.id]);

  // Load more
  const handleScroll = useCallback(async () => {
    const container = containerRef.current;
    if (!container || isLoadingMore || !hasMore || !nextCursor) return;
    if (container.scrollTop < 120) {
      setIsLoadingMore(true);
      const prevHeight = container.scrollHeight;
      try {
        const res = await fetchApi<{ success: boolean; data: Message[]; meta: { nextCursor: string; hasMore: boolean } }>(
          `/api/chat/messages/channels/${channelId}/messages?limit=50&cursor=${nextCursor}`
        );
        prependMessages(channelId, res.data || []);
        setNextCursor(res.meta?.nextCursor || null);
        setHasMore(res.meta?.hasMore ?? false);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevHeight;
        });
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [isLoadingMore, hasMore, nextCursor, channelId, prependMessages]);

  // Group messages by sender & time proximity
  const groupedMessages = channelMessages.map((msg, i) => {
    const prev = channelMessages[i - 1];
    const isGrouped = prev
      && prev.senderId === msg.senderId
      && !prev.deletedAt
      && new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
    return { ...msg, isGrouped: !!isGrouped };
  });

  return (
    <div
      className={cn(
        'flex min-w-0 h-full overflow-hidden rounded-[24px] border bg-background transition-all',
        isFocused ? 'border-cyan-400/35 shadow-[0_18px_45px_rgba(34,211,238,0.14)]' : 'border-border/70'
      )}
      onClick={onFocus}
    >
    <div className="flex flex-col flex-1 min-w-0 h-full bg-background">
      {/* Channel Header */}
      <div className="h-14 border-b border-border flex items-center px-4 gap-3 flex-shrink-0 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isDm && dmOtherMember ? (
            <div className="relative flex-shrink-0">
              {dmOtherMember.avatarUrl
                ? <img src={dmOtherMember.avatarUrl} alt={dmOtherMember.name} className="w-8 h-8 rounded-full object-cover" />
                : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-xs font-semibold text-white">
                    {displayInitials}
                  </div>
                )
              }
            </div>
          ) : (
            <Icon size={18} className="text-muted-foreground flex-shrink-0" strokeWidth={2} />
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-[15px] truncate leading-tight">{displayName}</h2>
            {channel?.topic && (
              <p className="text-xs text-muted-foreground truncate max-w-sm">{channel.topic}</p>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => startCall('AUDIO')}
            disabled={callStarting || !!activeCall}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Start a call"
          >
            <Phone size={16} />
          </button>
          <button
            onClick={() => startCall('VIDEO')}
            disabled={callStarting || !!activeCall}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Video call"
          >
            <Video size={16} />
          </button>
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Search in channel">
            <Search size={16} />
          </button>
          <button
            onClick={() => togglePinnedChannel(channelId)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isPinned ? 'bg-amber-500/12 text-amber-500 hover:bg-amber-500/18' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
          >
            <Pin size={16} />
          </button>
          <button
            onClick={() => setShowMembers(v => !v)}
            className={cn('p-2 rounded-lg transition-colors', showMembers ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}
            title="Members"
          >
            <Users size={16} />
          </button>
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Channel info">
            <Info size={16} />
          </button>
          {onClose && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Close chat"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-0 py-2"
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!hasMore && !isLoading && channelMessages.length > 0 && (
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Icon size={22} className="text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{introTitle}</h3>
                {channel?.description && (
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {introText}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-border" />
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col gap-4 px-6 py-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-muted rounded-full w-32" />
                  <div className="h-3 bg-muted rounded-full w-3/4" />
                  <div className="h-3 bg-muted rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && channelMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              {isDm && dmOtherMember ? (
                <span className="text-2xl font-bold text-primary">
                  {dmOtherMember.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <Icon size={28} className="text-primary" />
              )}
            </div>
            <h3 className="font-bold text-xl mb-2">
              {isDm && dmOtherMember ? `Message ${dmOtherMember.name}` : `Welcome to #${channel?.name}!`}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              {isDm && dmOtherMember
                ? `This is the beginning of your direct message history with ${dmOtherMember.name}.`
                : channel?.description || 'This is the start of something great. Send the first message!'}
            </p>
          </div>
        )}

        {!isLoading && groupedMessages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isGrouped={msg.isGrouped}
            currentUserId={user?.id || ''}
          />
        ))}

        {/* Typing indicator */}
        {channelTyping.length > 0 && (
          <div className="flex items-center gap-2 px-6 py-1 text-xs text-muted-foreground">
            <div className="flex gap-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span>
              {channelTyping.length === 1
                ? `${channelTyping[0].name} is typing…`
                : `${channelTyping.map(u => u.name).join(', ')} are typing…`
              }
            </span>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Composer */}
            <MessageComposer
              channelId={channelId}
              channelName={displayName || channel?.name}
              isDirectMessage={isDm}
            />
    </div>

    {/* Members Panel */}
    {showMembers && (
      <MembersPanel
        channelId={channelId}
        channelName={channel?.name}
        onClose={() => setShowMembers(false)}
        onInvite={() => { setShowInvite(true); }}
      />
    )}

    {/* Invite Modal */}
    {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

    {/* Call Overlay */}
    {activeCall && (
      <CallOverlay
        config={activeCall}
        onLeave={() => setActiveCall(null)}
        participants={dmOtherMember ? [{ name: dmOtherMember.name, avatarUrl: dmOtherMember.avatarUrl }] : []}
      />
    )}
    </div>
  );
}
