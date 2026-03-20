'use client';

import { useEffect } from 'react';
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
  const { accessToken } = useAuthStore();
  const { connect, socket } = useSocketStore();
  const {
    channels, setChannels, addMessage, updateMessage, deleteMessage,
    setTypingUser, activeChannelId, setActiveChannel, activeThreadMessageId,
    updateMessageReactions, unreadCounts, setUnreadCount,
  } = useChatStore();
  const { updatePresence } = usePresenceStore();
  const { setMembers } = useWorkspaceStore();

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

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:reaction', onMessageReaction);
    socket.on('typing:user', onTypingUser);
    socket.on('presence:update', onPresenceUpdate);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:reaction', onMessageReaction);
      socket.off('typing:user', onTypingUser);
      socket.off('presence:update', onPresenceUpdate);
    };
  }, [socket, addMessage, updateMessage, deleteMessage, setTypingUser, updatePresence, activeChannelId, updateMessageReactions, setUnreadCount, unreadCounts]);

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 min-w-0">
        {activeChannelId ? (
          <>
            <MessagePane channelId={activeChannelId} />
            {activeThreadMessageId && (
              <ThreadPanel parentMessageId={activeThreadMessageId} channelId={activeChannelId} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <span className="text-4xl">💬</span>
              </div>
              <h3 className="text-xl font-bold mb-2">Welcome to CLIQ</h3>
              <p className="text-muted-foreground text-sm">
                Select a channel from the sidebar to start chatting with your team.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
