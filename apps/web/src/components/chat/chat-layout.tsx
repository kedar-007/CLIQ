'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './sidebar';
import { MessagePane } from './message-pane';
import { ThreadPanel } from './thread-panel';
import { useAuthStore } from '@/store/auth.store';
import { useSocketStore } from '@/store/socket.store';
import { useChatStore } from '@/store/chat.store';
import { usePresenceStore } from '@/store/presence.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { fetchApi } from '@/lib/utils';
import type { Channel, Message } from '@comms/types';

interface ChatLayoutProps {
  channelId?: string;
}

export function ChatLayout({ channelId: initialChannelId }: ChatLayoutProps) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const { connect, socket } = useSocketStore();
  const {
    channels, setChannels, addMessage, updateMessage, deleteMessage,
    setTypingUser, activeChannelId, setActiveChannel, activeThreadMessageId,
    updateMessageReactions, unreadCounts, setUnreadCount, openChannelIds, closeChannel,
  } = useChatStore();
  const { updatePresence } = usePresenceStore();
  const { setMembers } = useWorkspaceStore();
  const messageAudioContextRef = useRef<AudioContext | null>(null);

  // Set initial channel from URL
  useEffect(() => {
    if (initialChannelId) setActiveChannel(initialChannelId);
  }, [initialChannelId, setActiveChannel]);

  // Connect socket
  useEffect(() => {
    if (accessToken) connect(accessToken);
    return () => {};
  }, [accessToken, connect]);

  // Load workspace members
  useEffect(() => {
    fetchApi<{ success: boolean; data: any[] }>('/api/auth/workspace/members')
      .then(res => {
        if (res.success && res.data) setMembers(res.data);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load channels
  useEffect(() => {
    fetchApi<{ success: boolean; data: Channel[] }>('/api/chat/channels')
      .then(res => {
        if (res.success && res.data) {
          setChannels(res.data);
          // Auto-select first channel if none active
          if (!activeChannelId && !initialChannelId && res.data.length > 0) {
            setActiveChannel(res.data[0].id);
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const playMessageTone = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!messageAudioContextRef.current) {
          messageAudioContextRef.current = new AudioCtx();
        }
        const ctx = messageAudioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 740;
        gain.gain.value = 0.02;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.12);
      } catch {
        // best effort only
      }
    };

    const onMessageNew = (msg: Message & { channelId: string }) => {
      addMessage(msg.channelId, msg);
      // Increment unread if not active channel
      if (msg.channelId !== activeChannelId) {
        setUnreadCount(msg.channelId, (unreadCounts[msg.channelId] || 0) + 1);
      }
      // If the channel isn't in the list (e.g. new DM from someone), reload channels
      const exists = useChatStore.getState().channels.some(c => c.id === msg.channelId);
      if (!exists) {
        fetchApi<{ success: boolean; data: Channel[] }>('/api/chat/channels')
          .then(res => { if (res.success && res.data) setChannels(res.data); })
          .catch(() => {});
      }

      if (msg.channelId !== activeChannelId && typeof window !== 'undefined' && 'Notification' in window) {
        void playMessageTone();
        if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        } else if (Notification.permission === 'granted') {
          const sender = msg.sender?.name || 'A teammate';
          const body = msg.content || 'Sent you a new message';
          new Notification(sender, { body });
        }
      }
    };

    const onMessageUpdated = (msg: any) => {
      updateMessage(msg.channelId || activeChannelId || '', msg.id, msg);
    };

    const onMessageDeleted = ({ messageId, channelId }: { messageId: string; channelId: string }) => {
      deleteMessage(channelId, messageId);
    };

    const onMessageReaction = ({ messageId, channelId, reactions }: any) => {
      // Find which channel this message belongs to
      const targetChannelId = channelId || (() => {
        for (const [cid, msgs] of Object.entries(useChatStore.getState().messages)) {
          if ((msgs as any[]).find((m: any) => m.id === messageId)) return cid;
        }
        return activeChannelId || '';
      })();
      if (targetChannelId) updateMessageReactions(targetChannelId, messageId, reactions);
    };

    const onTypingUser = ({ channelId, userId, user, isTyping }: any) => {
      setTypingUser(channelId, { userId, name: user?.name || userId, avatarUrl: user?.avatarUrl, channelId }, isTyping);
    };

    const onPresenceUpdate = (data: any) => {
      updatePresence(data.userId, {
        status: data.status,
        lastSeen: data.lastSeen,
        customStatusEmoji: data.customStatusEmoji,
        customStatusText: data.customStatusText,
      });
    };

    const onNotificationNew = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] }).catch(() => {});
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:reaction', onMessageReaction);
    socket.on('typing:user', onTypingUser);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('notification:new', onNotificationNew);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:reaction', onMessageReaction);
      socket.off('typing:user', onTypingUser);
      socket.off('presence:update', onPresenceUpdate);
      socket.off('notification:new', onNotificationNew);
      messageAudioContextRef.current?.close().catch(() => {});
      messageAudioContextRef.current = null;
    };
  }, [socket, addMessage, updateMessage, deleteMessage, setTypingUser, updatePresence, activeChannelId, updateMessageReactions, setUnreadCount, unreadCounts, queryClient, setChannels]);

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 min-w-0">
        {openChannelIds.length > 0 ? (
          <>
            <div className="conversation-surface grid flex-1 min-w-0 gap-3 rounded-[24px] p-3" style={{ gridTemplateColumns: `repeat(${Math.min(openChannelIds.length, 3)}, minmax(0, 1fr))` }}>
              {openChannelIds.map((channelId) => (
                <MessagePane
                  key={channelId}
                  channelId={channelId}
                  isFocused={channelId === activeChannelId}
                  onFocus={() => setActiveChannel(channelId)}
                  onClose={() => closeChannel(channelId)}
                />
              ))}
            </div>
            {activeThreadMessageId && (
              <ThreadPanel parentMessageId={activeThreadMessageId} channelId={activeChannelId} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-2xl px-8">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[32px] bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.3),_transparent_55%),linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,118,110,0.08))]">
                <span className="text-4xl">C</span>
              </div>
              <h3 className="mb-3 text-center text-3xl font-bold">Workspace Command Center</h3>
              <p className="mx-auto max-w-xl text-center text-sm text-muted-foreground">
                Channels, direct messages, files, and meetings are wired together in one multi-tenant workspace shell.
                Pick a team space from the left rail to start collaborating.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-border bg-card/70 p-5 text-left shadow-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary">Messaging</p>
                  <p className="mt-2 text-sm text-muted-foreground">Threads, reactions, and channel-first collaboration flow.</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/70 p-5 text-left shadow-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary">Calling</p>
                  <p className="mt-2 text-sm text-muted-foreground">Native WebRTC meetings with screen share and live controls.</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/70 p-5 text-left shadow-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary">SaaS Core</p>
                  <p className="mt-2 text-sm text-muted-foreground">Tenant-aware auth, roles, and plan-ready workspace architecture.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
