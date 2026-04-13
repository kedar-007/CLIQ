'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AtSign,
  Bold,
  Code,
  Italic,
  List,
  Mic,
  Paperclip,
  Send,
  Smile,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocketStore } from '@/store/socket.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { PresenceAvatar } from '@/components/workspace/dsv-shell';

interface MessageComposerProps {
  channelId: string;
  channelName?: string;
  isDirectMessage?: boolean;
  compact?: boolean;
  parentId?: string;
  onSent?: () => void;
}

export function MessageComposer({
  channelId,
  channelName,
  isDirectMessage,
  compact = false,
  parentId,
  onSent,
}: MessageComposerProps) {
  const { emit } = useSocketStore();
  const { members } = useWorkspaceStore();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);

  const filteredMembers = mentionSearch
    ? members.filter((member) => member.name.toLowerCase().includes(mentionSearch.toLowerCase())).slice(0, 6)
    : members.slice(0, 6);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Placeholder.configure({
        placeholder: isDirectMessage
          ? `Message ${channelName || 'your teammate'}`
          : `Message ${channelName ? `#${channelName}` : 'this space'}`,
      }),
    ],
    editorProps: {
      attributes: { class: 'outline-none' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !showMentions) {
          event.preventDefault();
          sendMessage();
          return true;
        }
        if (showMentions && event.key === 'Escape') {
          setShowMentions(false);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const cursorPos = editor.state.selection.anchor;
      const textBeforeCursor = text.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setMentionSearch(atMatch[1]);
        setShowMentions(true);
      } else {
        setShowMentions(false);
        setMentionSearch('');
      }

      emit('typing:start', { channelId });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        emit('typing:stop', { channelId });
      }, 3000);
    },
  });

  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  const insertMention = useCallback((memberName: string) => {
    if (!editor) return;
    const cursorPos = editor.state.selection.anchor;
    const text = editor.getText();
    const atMatch = text.slice(0, cursorPos).match(/@(\w*)$/);
    if (atMatch) {
      const from = cursorPos - atMatch[0].length;
      editor.chain().focus().deleteRange({ from, to: cursorPos }).insertContent(`@${memberName} `).run();
    }
    setShowMentions(false);
    setMentionSearch('');
  }, [editor]);

  const sendMessage = useCallback(() => {
    if (!editor) return;
    const content = editor.getText().trim();
    const contentRaw = editor.getJSON();
    if (!content) return;
    emit('message:send', { channelId, content, contentRaw, parentId });
    editor.commands.clearContent();
    emit('typing:stop', { channelId });
    setShowMentions(false);
    onSent?.();
  }, [channelId, editor, emit, onSent, parentId]);

  const hasContent = !!editor?.getText().trim();
  const toolbarButtons = [
    { icon: Bold, label: 'Bold', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
    { icon: Italic, label: 'Italic', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
    { icon: Code, label: 'Code', action: () => editor?.chain().focus().toggleCode().run(), active: editor?.isActive('code') },
    { icon: List, label: 'List', action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
  ];

  return (
    <div className={cn('relative pb-3 pt-3', compact ? 'px-2' : 'px-3')}>
      {showMentions && filteredMembers.length > 0 ? (
        <div className="absolute bottom-full left-4 right-4 z-30 mb-3 overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_20px_40px_rgba(17,24,39,0.14)] animate-fadeIn">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Mention someone</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(member.name);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <PresenceAvatar name={member.name} src={member.avatarUrl} status={member.status as any} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

        <div
        className={cn(
          'rounded-[28px] border bg-card px-4 py-3 shadow-[0_18px_40px_rgba(17,24,39,0.08)] transition-all duration-200',
          hasContent ? 'border-primary/20 shadow-[0_24px_50px_rgba(26,86,219,0.10)]' : 'border-border/80',
          compact && 'rounded-[22px] px-3 py-2.5'
        )}
      >
        <div className={cn('mb-3 flex items-center gap-1', compact && 'mb-2')}>
          {toolbarButtons.map(({ icon: Icon, label, action, active }) => (
            <button
              key={label}
              onMouseDown={(event) => {
                event.preventDefault();
                action();
              }}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                compact && 'h-8 w-8 rounded-lg',
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button className={cn('inline-flex items-center gap-1 rounded-full bg-[#7C3AED]/10 px-3 py-1.5 text-xs font-medium text-[#7C3AED]', compact && 'px-2.5 py-1')}>
            <Sparkles className="h-3.5 w-3.5" />
            AI assist
          </button>
        </div>

        <div className={cn('px-1', compact ? 'min-h-[44px]' : 'min-h-[54px]')}>
          <EditorContent editor={editor} />
        </div>

        <div className={cn('mt-3 flex items-center gap-2', compact && 'mt-2')}>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Paperclip className="h-4 w-4" />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Smile className="h-4 w-4" />
          </button>
          <button
            onMouseDown={(event) => {
              event.preventDefault();
              editor?.chain().focus().insertContent('@').run();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <AtSign className="h-4 w-4" />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Mic className="h-4 w-4" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            {!compact ? <p className="hidden text-xs text-muted-foreground md:block">Shift + Enter for a new line</p> : null}
            {hasContent ? (
              <button
                onClick={sendMessage}
                className={cn(
                  'flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-[0_12px_28px_rgba(26,86,219,0.22)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary/90',
                  compact && 'px-3.5 py-2 text-[13px]'
                )}
              >
                Send
                <Send className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
