'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Hash, User, FileText, MessageSquare, X, Loader2, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SearchMessage {
  id: string;
  content: string;
  channelId: string;
  channelName?: string;
  senderName?: string;
  createdAt: string;
}

interface SearchPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  jobTitle?: string;
}

interface SearchFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  channelId: string;
  createdAt: string;
}

interface SearchChannel {
  id: string;
  name: string;
  slug: string;
  type: string;
  memberCount?: number;
  description?: string;
}

interface SearchResults {
  messages?: SearchMessage[];
  people?: SearchPerson[];
  files?: SearchFile[];
  channels?: SearchChannel[];
}

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FlatResult = {
  key: string;
  section: 'messages' | 'people' | 'files' | 'channels';
  href: string;
  render: () => React.ReactNode;
};

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset index when results change
  useEffect(() => setActiveIndex(0), [debouncedQuery]);

  const { data, isLoading } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () =>
      fetchApi<{ success: boolean; data: SearchResults }>(`/api/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 10_000,
  });

  const results = data?.data;

  // Build flat ordered list of results
  const flatResults: FlatResult[] = [];

  (results?.messages || []).slice(0, 5).forEach((msg) => {
    flatResults.push({
      key: `msg-${msg.id}`,
      section: 'messages',
      href: `/${msg.channelId}?messageId=${msg.id}`,
      render: () => (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {msg.channelName && (
                <span className="text-xs font-medium text-muted-foreground">#{msg.channelName}</span>
              )}
              {msg.senderName && (
                <span className="text-xs text-muted-foreground">· {msg.senderName}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {msg.createdAt ? format(new Date(msg.createdAt), 'MMM d') : ''}
              </span>
            </div>
            <p className="text-sm truncate text-foreground">{msg.content}</p>
          </div>
        </div>
      ),
    });
  });

  (results?.people || []).slice(0, 3).forEach((person) => {
    flatResults.push({
      key: `person-${person.id}`,
      section: 'people',
      href: `/dm/${person.id}`,
      render: () => (
        <div className="flex items-center gap-3">
          {person.avatarUrl ? (
            <img src={person.avatarUrl} alt={person.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
              {person.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{person.name}</p>
            <p className="text-xs text-muted-foreground truncate">{person.jobTitle || person.email}</p>
          </div>
        </div>
      ),
    });
  });

  (results?.files || []).slice(0, 3).forEach((file) => {
    flatResults.push({
      key: `file-${file.id}`,
      section: 'files',
      href: `/${file.channelId}?fileId=${file.id}`,
      render: () => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.fileSize)}</p>
          </div>
        </div>
      ),
    });
  });

  (results?.channels || []).slice(0, 3).forEach((ch) => {
    flatResults.push({
      key: `channel-${ch.id}`,
      section: 'channels',
      href: `/${ch.id}`,
      render: () => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Hash className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">#{ch.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {ch.memberCount !== undefined ? `${ch.memberCount} members` : ''}
              {ch.description ? (ch.memberCount !== undefined ? ' · ' : '') + ch.description : ''}
            </p>
          </div>
        </div>
      ),
    });
  });

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const result = flatResults[activeIndex];
        if (result) handleSelect(result.href);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flatResults, activeIndex, handleSelect, onClose]
  );

  if (!open) return null;

  const hasResults = flatResults.length > 0;
  const showEmpty = debouncedQuery.trim() && !isLoading && !hasResults;

  const sectionLabels: Record<string, string> = {
    messages: 'Messages',
    people: 'People',
    files: 'Files',
    channels: 'Channels',
  };

  // Build sections with section headers
  const sections: Array<{ section: string; items: FlatResult[] }> = [];
  let current: { section: string; items: FlatResult[] } | null = null;
  for (const r of flatResults) {
    if (!current || current.section !== r.section) {
      current = { section: r.section, items: [] };
      sections.push(current);
    }
    current.items.push(r);
  }

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages, files, people..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto">
          {!debouncedQuery.trim() && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Search className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Search your workspace</p>
              <p className="text-xs text-muted-foreground mt-1">Find messages, files, people, and channels</p>
            </div>
          )}

          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <p className="text-sm text-muted-foreground">
                No results for{' '}
                <span className="font-medium text-foreground">&ldquo;{debouncedQuery}&rdquo;</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Try different keywords.</p>
            </div>
          )}

          {sections.map((sec) => (
            <div key={sec.section}>
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {sectionLabels[sec.section]}
                </p>
              </div>
              {sec.items.map((result) => {
                const itemIndex = globalIndex++;
                const isActive = itemIndex === activeIndex;
                return (
                  <button
                    key={result.key}
                    onClick={() => handleSelect(result.href)}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    className={cn(
                      'w-full px-4 py-2.5 text-left transition-colors',
                      isActive ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    {result.render()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">↑↓</kbd> navigate
            &nbsp;&nbsp;
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">↵</kbd> open
            &nbsp;&nbsp;
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">Esc</kbd> close
          </p>
        </div>
      </div>
    </div>
  );
}
