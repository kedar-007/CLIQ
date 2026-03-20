'use client';

import { useEffect, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { MessageItem } from './message-item';
import { MessageComposer } from './message-composer';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Message } from '@comms/types';

interface ThreadPanelProps {
  parentMessageId: string;
  channelId: string;
}

export function ThreadPanel({ parentMessageId, channelId }: ThreadPanelProps) {
  const { setActiveThread, messages } = useChatStore();
  const { user } = useAuthStore();
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [parentMessage, setParentMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const parent = (messages[channelId] || []).find(m => m.id === parentMessageId);
    if (parent) setParentMessage(parent);

    setIsLoading(true);
    fetchApi<{ success: boolean; data: Message[] }>(
      `/api/chat/messages/channels/${channelId}/thread/${parentMessageId}`
    ).then(res => {
      setThreadMessages(res.data || []);
    }).catch(() => {}).finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentMessageId, channelId]);

  return (
    <div className="w-[340px] flex-shrink-0 flex flex-col h-full border-l border-border bg-background animate-slideInRight">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-muted-foreground" />
          <h3 className="font-semibold text-[15px]">Thread</h3>
        </div>
        <button
          onClick={() => setActiveThread(null)}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Parent message */}
      {parentMessage && (
        <div className="border-b border-border bg-muted/20 py-2">
          <MessageItem message={parentMessage} currentUserId={user?.id || ''} />
        </div>
      )}

      {/* Divider */}
      {!isLoading && threadMessages.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="h-px bg-border flex-1" />
          <span className="text-xs text-muted-foreground font-medium">
            {threadMessages.length} {threadMessages.length === 1 ? 'reply' : 'replies'}
          </span>
          <div className="h-px bg-border flex-1" />
        </div>
      )}

      {/* Thread replies */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded-full w-24" />
                  <div className="h-3 bg-muted rounded-full w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : threadMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
            <MessageSquare size={32} className="text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No replies yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Be the first to reply in this thread</p>
          </div>
        ) : (
          <div className="py-2">
            {threadMessages.map(msg => (
              <MessageItem key={msg.id} message={msg} currentUserId={user?.id || ''} />
            ))}
          </div>
        )}
      </div>

      {/* Reply composer */}
      <div className="border-t border-border pt-2">
        <MessageComposer channelId={channelId} channelName="thread" parentId={parentMessageId} />
      </div>
    </div>
  );
}
