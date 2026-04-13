'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Channel, Message } from '@comms/types';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { usePresenceStore } from '@/store/presence.store';
import { useSocketStore } from '@/store/socket.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { MessagePane } from './message-pane';
import { SidebarContent } from './sidebar';
import { ThreadPanel } from './thread-panel';
import { EmptyWorkspaceState } from '@/components/workspace/dsv-shell';

interface ChatLayoutProps {
  channelId?: string;
}

export function ChatLayout({ channelId: initialChannelId }: ChatLayoutProps) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const { connect, socket } = useSocketStore();
  const {
    channels,
    setChannels,
    addMessage,
    updateMessage,
    deleteMessage,
    updateMessageReactions,
    setTypingUser,
    unreadCounts,
    setUnreadCount,
    activeChannelId,
    setActiveChannel,
    activeThreadMessageId,
    openChannelIds,
    closeChannel,
  } = useChatStore();
  const { updatePresence } = usePresenceStore();
  const { setMembers } = useWorkspaceStore();
  const messageAudioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (initialChannelId) setActiveChannel(initialChannelId);
  }, [initialChannelId, setActiveChannel]);

  useEffect(() => {
    if (accessToken) connect(accessToken);
  }, [accessToken, connect]);

  useEffect(() => {
    fetchApi<{ success: boolean; data: any[] }>('/api/auth/workspace/members')
      .then((response) => {
        if (response.success && response.data) setMembers(response.data);
      })
      .catch(() => {});
  }, [setMembers]);

  useEffect(() => {
    fetchApi<{ success: boolean; data: Channel[] }>('/api/chat/channels')
      .then((response) => {
        if (response.success && response.data) {
          setChannels(response.data);
          if (!activeChannelId && !initialChannelId && response.data.length > 0) {
            setActiveChannel(response.data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [activeChannelId, initialChannelId, setActiveChannel, setChannels]);

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
        if (ctx.state === 'suspended') await ctx.resume();

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(740, ctx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(620, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.018, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.18);
      } catch {
        // best effort
      }
    };

    const onMessageNew = (message: Message & { channelId: string }) => {
      addMessage(message.channelId, message);
      if (message.channelId !== activeChannelId) {
        setUnreadCount(message.channelId, (unreadCounts[message.channelId] || 0) + 1);
      }

      const exists = useChatStore.getState().channels.some((channel) => channel.id === message.channelId);
      if (!exists) {
        fetchApi<{ success: boolean; data: Channel[] }>('/api/chat/channels')
          .then((response) => {
            if (response.success && response.data) setChannels(response.data);
          })
          .catch(() => {});
      }

      if (message.channelId !== activeChannelId && typeof window !== 'undefined' && 'Notification' in window) {
        void playMessageTone();
        if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        } else if (Notification.permission === 'granted') {
          new Notification(message.sender?.name || 'DSV Connect', {
            body: message.content || 'New message received',
          });
        }
      }
    };

    const onMessageUpdated = (message: any) => {
      updateMessage(message.channelId || activeChannelId || '', message.id, message);
    };

    const onMessageDeleted = ({ messageId, channelId }: { messageId: string; channelId: string }) => {
      deleteMessage(channelId, messageId);
    };

    const onMessageReaction = ({ messageId, channelId, reactions }: any) => {
      const targetChannelId =
        channelId ||
        (() => {
          for (const [cid, msgs] of Object.entries(useChatStore.getState().messages)) {
            if ((msgs as any[]).find((message: any) => message.id === messageId)) return cid;
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
  }, [
    socket,
    addMessage,
    activeChannelId,
    deleteMessage,
    queryClient,
    setChannels,
    setTypingUser,
    setUnreadCount,
    unreadCounts,
    updateMessage,
    updateMessageReactions,
    updatePresence,
  ]);

  return (
    <div className="flex h-full min-w-0 overflow-hidden rounded-[32px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.9))] shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.84),rgba(15,23,42,0.76))]">
      <div className="hidden lg:block">
        <SidebarContent compact={openChannelIds.length > 0} />
      </div>

      <div className="flex min-w-0 flex-1 gap-3 overflow-hidden p-2 md:p-3 lg:gap-4 lg:p-4">
        {openChannelIds.length > 0 ? (
          <>
            <div
              className={`
                grid min-w-0 flex-1 gap-3 lg:gap-4
                ${openChannelIds.length === 1 ? 'grid-cols-1' : ''}
                ${openChannelIds.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : ''}
                ${openChannelIds.length >= 3 ? 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3' : ''}
              `}
            >
              {openChannelIds.map((channelId) => (
                <MessagePane
                  key={channelId}
                  channelId={channelId}
                  isFocused={channelId === activeChannelId}
                  compact={openChannelIds.length > 1}
                  onFocus={() => setActiveChannel(channelId)}
                  onClose={() => closeChannel(channelId)}
                />
              ))}
            </div>
            {activeThreadMessageId ? (
              <div className="hidden w-[360px] shrink-0 xl:block">
                <ThreadPanel parentMessageId={activeThreadMessageId} channelId={activeChannelId} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <div className="max-w-3xl">
              <EmptyWorkspaceState
                title="Choose a conversation to begin"
                description="Open a channel, jump into a direct message, or start a fresh collaboration thread from the context panel."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
