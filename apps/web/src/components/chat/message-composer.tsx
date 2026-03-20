'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Send, Paperclip, Smile, AtSign, Bold, Italic,
  Code, List, Link2, Mic
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocketStore } from '@/store/socket.store';
import { useWorkspaceStore } from '@/store/workspace.store';

interface MessageComposerProps {
  channelId: string;
  channelName?: string;
  parentId?: string;
  onSent?: () => void;
}

export function MessageComposer({ channelId, channelName, parentId, onSent }: MessageComposerProps) {
  const { emit } = useSocketStore();
  const { members } = useWorkspaceStore();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionStart, setMentionStart] = useState<number>(-1);

  const filteredMembers = mentionSearch
    ? members.filter(m => m.name.toLowerCase().includes(mentionSearch.toLowerCase())).slice(0, 6)
    : members.slice(0, 6);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Placeholder.configure({
        placeholder: `Message ${channelName ? `#${channelName}` : '…'}`,
      }),
    ],
    editorProps: {
      attributes: { class: 'outline-none' },
      handleKeyDown: (_view, event) => {
        if (showMentions) {
          if (event.key === 'Escape') { setShowMentions(false); return true; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return true;
        }
        if (event.key === 'Enter' && !event.shiftKey && !showMentions) {
          event.preventDefault();
          sendMessage();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const cursorPos = editor.state.selection.anchor;
      const textBeforeCursor = text.slice(0, cursorPos);

      // Detect @mention trigger
      const atMatch = textBeforeCursor.match(/@(\w*)$/);
      if (atMatch) {
        setMentionSearch(atMatch[1]);
        setMentionStart(cursorPos - atMatch[0].length);
        setShowMentions(true);
      } else {
        setShowMentions(false);
        setMentionSearch('');
        setMentionStart(-1);
      }

      emit('typing:start', { channelId });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        emit('typing:stop', { channelId });
      }, 3000);
    },
  });

  const insertMention = useCallback((memberName: string) => {
    if (!editor) return;
    const text = editor.getText();
    // Replace from @ to cursor with @name
    const cursorPos = editor.state.selection.anchor;
    const atMatch = text.slice(0, cursorPos).match(/@(\w*)$/);
    if (atMatch) {
      const from = cursorPos - atMatch[0].length;
      editor.chain().focus()
        .deleteRange({ from, to: cursorPos })
        .insertContent(`@${memberName} `)
        .run();
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
  }, [editor, channelId, parentId, emit, onSent]);

  const hasContent = !!editor?.getText().trim();

  const formatButtons = [
    { icon: Bold, action: () => editor?.chain().focus().toggleBold().run(), label: 'Bold', isActive: editor?.isActive('bold') },
    { icon: Italic, action: () => editor?.chain().focus().toggleItalic().run(), label: 'Italic', isActive: editor?.isActive('italic') },
    { icon: Code, action: () => editor?.chain().focus().toggleCode().run(), label: 'Code', isActive: editor?.isActive('code') },
    { icon: List, action: () => editor?.chain().focus().toggleBulletList().run(), label: 'List', isActive: editor?.isActive('bulletList') },
  ];

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0 relative">
      {/* @mention dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full mb-1 left-4 right-4 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-fadeIn">
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider border-b border-border">
            People — type to filter
          </div>
          {filteredMembers.map((member) => {
            const initials = member.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
            const gradients = ['from-violet-500 to-indigo-600', 'from-rose-500 to-pink-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600'];
            const grad = gradients[member.name.charCodeAt(0) % gradients.length];
            return (
              <button
                key={member.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(member.name); }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                {member.avatarUrl
                  ? <img src={member.avatarUrl} alt={member.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : (
                    <div className={cn('w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0', grad)}>
                      {initials}
                    </div>
                  )
                }
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
                <span className={cn(
                  'ml-auto text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                  member.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                )}>
                  {member.status === 'ONLINE' ? 'Online' : 'Away'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={cn(
        'rounded-2xl border bg-card shadow-sm transition-all duration-150',
        hasContent ? 'border-ring/50 shadow-sm shadow-ring/10' : 'border-border'
      )}>
        {/* Top toolbar */}
        <div className="flex items-center gap-0.5 px-3 pt-2.5 pb-1.5">
          {formatButtons.map(({ icon: Icon, action, label, isActive }) => (
            <button
              key={label}
              onMouseDown={e => { e.preventDefault(); action(); }}
              className={cn(
                'p-1.5 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
              title={label}
            >
              <Icon size={14} />
            </button>
          ))}
          <div className="w-px h-4 bg-border mx-1" />
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Add link"
          >
            <Link2 size={14} />
          </button>
        </div>

        {/* Editor area */}
        <div className="px-4 py-1.5 min-h-[36px]">
          <EditorContent editor={editor} />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center gap-1 px-3 pb-2.5 pt-1.5 border-t border-border/50">
          <button
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>
          <button
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Add emoji"
          >
            <Smile size={16} />
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); editor?.chain().focus().insertContent('@').run(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Mention someone"
          >
            <AtSign size={16} />
          </button>
          <button
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Voice message"
          >
            <Mic size={16} />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {hasContent && (
              <span className="text-xs text-muted-foreground">
                Shift+Enter for new line
              </span>
            )}
            <button
              onClick={sendMessage}
              disabled={!hasContent}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-150',
                hasContent
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 scale-100'
                  : 'bg-muted text-muted-foreground cursor-not-allowed scale-90 opacity-50'
              )}
              title="Send (Enter)"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
