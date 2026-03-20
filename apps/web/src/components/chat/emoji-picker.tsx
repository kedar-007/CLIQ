'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmojiData {
  id: string;
  name: string;
  native: string;
  unified: string;
  keywords?: string[];
  shortcodes?: string;
}

interface EmojiPickerProps {
  onEmojiSelect: (emoji: { native: string }) => void;
  trigger?: React.ReactNode;
}

// Module-level cache so we only load once
let CachedPicker: React.ComponentType<any> | null = null;
let cachedData: unknown = null;

async function loadEmojiMart(): Promise<{ Picker: React.ComponentType<any>; data: unknown }> {
  if (CachedPicker && cachedData) {
    return { Picker: CachedPicker, data: cachedData };
  }
  const [{ default: Picker }, { default: data }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data'),
  ]);
  CachedPicker = Picker;
  cachedData = data;
  return { Picker, data };
}

function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function EmojiPicker({ onEmojiSelect, trigger }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [Picker, setPicker] = useState<React.ComponentType<any> | null>(null);
  const [emojiData, setEmojiData] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Lazy load when first opened
  useEffect(() => {
    if (open && !loaded) {
      loadEmojiMart().then(({ Picker: P, data: d }) => {
        setPicker(() => P);
        setEmojiData(d);
        setLoaded(true);
      });
    }
  }, [open, loaded]);

  // Compute popover position (auto-flip upward if near bottom)
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const pickerHeight = 435; // approximate emoji-mart height
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow >= pickerHeight || spaceBelow >= spaceAbove) {
      // Position below
      setPopoverStyle({ top: rect.bottom + 8, left: rect.left });
    } else {
      // Flip up
      setPopoverStyle({ bottom: viewportHeight - rect.top + 8, left: rect.left });
    }
  }, [open]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleEmojiSelect = useCallback(
    (emoji: EmojiData) => {
      onEmojiSelect({ native: emoji.native });
      setOpen(false);
    },
    [onEmojiSelect]
  );

  return (
    <>
      {trigger ? (
        <span ref={triggerRef as any} onClick={() => setOpen((v) => !v)} style={{ display: 'contents' }}>
          {trigger}
        </span>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
            open && 'bg-accent text-foreground'
          )}
          aria-label="Pick emoji"
          title="Add emoji"
        >
          <Smile className="w-4 h-4" />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          className="fixed z-[9999]"
          style={popoverStyle}
        >
          {loaded && Picker && emojiData ? (
            <Picker
              data={emojiData}
              onEmojiSelect={handleEmojiSelect}
              theme={theme}
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          ) : (
            <div className="w-72 h-64 flex items-center justify-center bg-card border border-border rounded-xl shadow-xl">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                <span className="text-xs">Loading emojis...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
