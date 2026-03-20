'use client';

import { useState, useRef } from 'react';
import { Reply, Smile, Bookmark, Trash2, Pencil, MoreHorizontal, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocketStore } from '@/store/socket.store';
import { useChatStore } from '@/store/chat.store';
import type { Message } from '@comms/types';

interface MessageItemProps {
  message: Message & { isGrouped?: boolean };
  isGrouped?: boolean;
  currentUserId: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

function formatTime(dateVal: string | Date) {
  const d = new Date(dateVal);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimeFull(dateVal: string | Date) {
  const d = new Date(dateVal);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
}

export function MessageItem({ message, isGrouped, currentUserId }: MessageItemProps) {
  const { emit } = useSocketStore();
  const { setActiveThread } = useChatStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');
  const [showMore, setShowMore] = useState(false);

  const isOwn = message.senderId === currentUserId;
  const isDeleted = !!message.deletedAt;

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      emit('message:edit', { messageId: message.id, content: editContent.trim() });
    }
    setIsEditing(false);
  };

  if (isDeleted) {
    return (
      <div className={cn('px-6 py-0.5', isGrouped ? 'mt-0' : 'mt-3')}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50 italic">
          <span>This message was deleted.</span>
        </div>
      </div>
    );
  }

  const senderName = message.sender?.name || (message as any).user?.name || 'Unknown';
  const senderAvatar = message.sender?.avatarUrl || (message as any).user?.avatarUrl;
  const senderInitial = senderName.charAt(0).toUpperCase();

  // Unique gradient per user
  const gradients = [
    'from-violet-500 to-indigo-600',
    'from-rose-500 to-pink-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-sky-500 to-blue-600',
    'from-fuchsia-500 to-purple-600',
  ];
  const gradientIdx = senderName.charCodeAt(0) % gradients.length;
  const gradient = gradients[gradientIdx];

  return (
    <div className={cn(
      'message-row group relative flex gap-3 px-4 py-0.5 hover:bg-accent/40 transition-colors duration-75',
      isGrouped ? 'mt-0' : 'mt-3'
    )}>
      {/* Avatar / Time for grouped */}
      <div className="w-9 flex-shrink-0 mt-0.5">
        {!isGrouped ? (
          senderAvatar
            ? <img src={senderAvatar} alt={senderName} className="w-9 h-9 rounded-full object-cover" />
            : (
              <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-semibold', gradient)}>
                {senderInitial}
              </div>
            )
        ) : (
          <span className="message-actions text-[10px] text-muted-foreground/40 flex items-center justify-end w-full h-5 mt-0.5">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-[14px] text-foreground hover:underline cursor-pointer">
              {senderName}
            </span>
            <span className="text-[11px] text-muted-foreground" title={formatTimeFull(message.createdAt)}>
              {formatTimeFull(message.createdAt)}
            </span>
            {message.isEdited && (
              <span className="text-[10px] text-muted-foreground/60">(edited)</span>
            )}
          </div>
        )}

        {/* Message content */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="w-full px-3 py-2 text-sm bg-background border border-ring rounded-xl resize-none outline-none focus:ring-2 focus:ring-ring/50"
              rows={Math.min(editContent.split('\n').length + 1, 8)}
              autoFocus
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button onClick={handleEdit} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                Save
              </button>
              <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs border border-border rounded-lg hover:bg-accent transition-colors">
                Cancel
              </button>
              <span className="text-xs text-muted-foreground">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <p className="text-[14px] text-foreground leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(message.attachments as any[]).map((att) => (
              <div key={att.id} className="rounded-xl border border-border overflow-hidden shadow-sm">
                {att.mimeType?.startsWith('image/') && (att.thumbnailUrl || att.url) ? (
                  <img
                    src={att.thumbnailUrl || att.url}
                    alt={att.fileName}
                    className="max-w-xs max-h-64 object-cover"
                  />
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted min-w-[180px]">
                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                      <span className="text-xs font-mono text-muted-foreground">
                        {att.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium truncate max-w-[160px]">{att.fileName}</p>
                      {att.fileSize && (
                        <p className="text-xs text-muted-foreground">
                          {(att.fileSize / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && (message.reactions as any[]).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(message.reactions as any[]).map((r) => (
              <button
                key={r.emoji}
                onClick={() => emit('message:react', { messageId: message.id, emoji: r.emoji, action: r.hasReacted ? 'remove' as const : 'add' as const })}
                className={cn(
                  'flex items-center gap-1 h-6 px-2 rounded-full border text-xs font-medium transition-colors',
                  r.hasReacted
                    ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-border bg-muted/50 text-foreground hover:border-primary/30 hover:bg-accent'
                )}
                title={r.users?.join(', ')}
              >
                <span>{r.emoji}</span>
                <span className="text-[11px]">{r.count}</span>
              </button>
            ))}
            <button
              onClick={() => {}}
              className="flex items-center gap-1 h-6 w-6 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              title="Add reaction"
            >
              <span className="text-xs mx-auto">+</span>
            </button>
          </div>
        )}

        {/* Thread replies */}
        {(message.replyCount || 0) > 0 && (
          <button
            onClick={() => setActiveThread(message.id)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Reply size={12} />
            <span>{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</span>
          </button>
        )}
      </div>

      {/* Floating action toolbar */}
      <div className="message-actions absolute right-4 top-0 -translate-y-1/2 flex items-center gap-0.5 bg-card border border-border rounded-xl shadow-md px-1 py-0.5 z-10">
        {QUICK_REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => emit('message:react', { messageId: message.id, emoji, action: 'add' as const })}
            className="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-accent transition-colors"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          onClick={() => setActiveThread(message.id)}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          title="Reply in thread"
        >
          <Reply size={13} />
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          title="Save message"
        >
          <Bookmark size={13} />
        </button>
        {isOwn && (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title="Edit message"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => emit('message:delete', { messageId: message.id })}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              title="Delete message"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
        <button
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          title="More actions"
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  );
}
