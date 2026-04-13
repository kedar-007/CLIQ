'use client';

import { useState } from 'react';
import { Bookmark, Pencil, Pin, Reply, Smile, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat.store';
import { useSocketStore } from '@/store/socket.store';
import type { Message } from '@comms/types';

interface MessageItemProps {
  message: Message & { isGrouped?: boolean };
  isGrouped?: boolean;
  currentUserId: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👏'];

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDatePill(value: string | Date) {
  const date = new Date(value);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function MessageItem({ message, isGrouped, currentUserId }: MessageItemProps) {
  const { emit } = useSocketStore();
  const { setActiveThread } = useChatStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');

  const isOwn = message.senderId === currentUserId;
  const isDeleted = !!message.deletedAt;
  const senderName = message.sender?.name || (message as any).user?.name || 'Unknown';
  const senderAvatar = message.sender?.avatarUrl || (message as any).user?.avatarUrl;
  const senderInitials = senderName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const gradients = [
    'from-[#1A56DB] to-[#7C3AED]',
    'from-[#0E9F6E] to-[#1A56DB]',
    'from-[#F59E0B] to-[#EF4444]',
    'from-[#7C3AED] to-[#1A56DB]',
  ];
  const gradient = gradients[senderName.charCodeAt(0) % gradients.length];

  if (isDeleted) {
    return (
      <div className={cn('px-3 py-1.5', isGrouped ? 'mt-0' : 'mt-4')}>
        <p className="rounded-full bg-muted px-3 py-1 text-xs italic text-muted-foreground">
          This message was removed.
        </p>
      </div>
    );
  }

  const handleSave = () => {
    if (editContent.trim() && editContent !== message.content) {
      emit('message:edit', { messageId: message.id, content: editContent.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div className={cn('message-row relative px-2 py-1.5', isGrouped ? 'mt-0' : 'mt-5')}>
      <div className={cn('flex gap-3', isOwn && 'justify-end')}>
        {!isOwn ? (
          <div className="w-10 shrink-0">
            {!isGrouped ? (
              senderAvatar ? (
                <img src={senderAvatar} alt={senderName} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white', gradient)}>
                  {senderInitials}
                </div>
              )
            ) : null}
          </div>
        ) : null}

        <div className={cn('min-w-0 max-w-[78%]', isOwn && 'flex flex-col items-end')}>
          {!isGrouped ? (
            <div className={cn('mb-1 flex items-center gap-2', isOwn && 'justify-end')}>
              {!isOwn ? <span className="text-sm font-semibold text-foreground">{senderName}</span> : null}
              <span className="text-[11px] text-muted-foreground">{formatDatePill(message.createdAt)} · {formatTime(message.createdAt)}</span>
              {message.isEdited ? <span className="text-[10px] text-muted-foreground">(edited)</span> : null}
            </div>
          ) : (
            <span className={cn('mb-1 text-[10px] text-muted-foreground', isOwn && 'mr-2')}>{formatTime(message.createdAt)}</span>
          )}

          {isEditing ? (
            <div className="w-full min-w-[320px] rounded-[20px] border border-primary/20 bg-card p-3 shadow-[0_12px_24px_rgba(17,24,39,0.10)]">
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSave();
                  }
                  if (event.key === 'Escape') setIsEditing(false);
                }}
                className="min-h-[100px] w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-[rgba(26,86,219,0.12)]"
              />
              <div className="mt-3 flex items-center gap-2">
                <button onClick={handleSave} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">
                  Save
                </button>
                <button onClick={() => setIsEditing(false)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-[24px] border px-4 py-3.5 shadow-[0_12px_26px_rgba(17,24,39,0.06)] transition-colors',
                isOwn
                  ? 'border-[#1A56DB]/18 bg-[linear-gradient(180deg,rgba(26,86,219,0.14),rgba(124,58,237,0.06))]'
                  : 'border-border/80 bg-white/92 dark:bg-slate-950'
              )}
            >
              <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">{message.content}</p>
            </div>
          )}

          {message.reactions && message.reactions.length > 0 ? (
            <div className={cn('mt-2 flex flex-wrap gap-1.5', isOwn && 'justify-end')}>
              {message.reactions.map((reaction: any) => (
                <button
                  key={reaction.emoji}
                  onClick={() =>
                    emit('message:react', {
                      messageId: message.id,
                      emoji: reaction.emoji,
                      action: reaction.hasReacted ? ('remove' as const) : ('add' as const),
                    })
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    reaction.hasReacted
                      ? 'border-primary/20 bg-primary/10 text-primary'
                      : 'border-border bg-muted/45 text-foreground hover:border-primary/20'
                  )}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
            </div>
          ) : null}

          {(message.replyCount || 0) > 0 ? (
            <button
              onClick={() => setActiveThread(message.id)}
              className={cn('mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary', isOwn && 'self-end')}
            >
              <Reply className="h-3.5 w-3.5" />
              {message.replyCount} thread replies
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn('message-actions absolute top-1 z-10 flex items-center gap-1 rounded-full border border-border/80 bg-white/95 px-2 py-1 shadow-[0_16px_32px_rgba(17,24,39,0.12)] backdrop-blur', isOwn ? 'left-8' : 'right-8 dark:bg-slate-950/95')}>
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => emit('message:react', { messageId: message.id, emoji, action: 'add' as const })}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-colors hover:bg-muted"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={() => setActiveThread(message.id)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Reply in thread"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bookmark className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Pin className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Smile className="h-3.5 w-3.5" />
        </button>
        {isOwn ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => emit('message:delete', { messageId: message.id })}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
