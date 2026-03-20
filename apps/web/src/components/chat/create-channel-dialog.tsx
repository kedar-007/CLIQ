'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Hash, Lock, Search, Loader2 } from 'lucide-react';
import { fetchApi, cn } from '@/lib/utils';
import type { Channel, User } from '@comms/types';

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

interface CreateChannelPayload {
  name: string;
  type: 'PUBLIC' | 'PRIVATE';
  description?: string;
  memberIds: string[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateChannelName(name: string): string | null {
  if (!name.trim()) return 'Channel name is required.';
  const slug = slugify(name);
  if (slug.length < 2) return 'Channel name must be at least 2 characters.';
  if (slug.length > 80) return 'Channel name must be 80 characters or fewer.';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Channel name can only contain lowercase letters, numbers, and hyphens.';
  return null;
}

export function CreateChannelDialog({ open, onClose, onCreated }: CreateChannelDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [description, setDescription] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const slug = slugify(name);

  // Search users for invite
  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ['user-search', memberSearch],
    queryFn: () =>
      fetchApi<{ success: boolean; data: User[] }>(`/api/auth/users?search=${encodeURIComponent(memberSearch)}&limit=10`),
    enabled: memberSearch.trim().length >= 1,
    staleTime: 5000,
  });

  const suggestions = (searchResults?.data || []).filter(
    (u) => !selectedMembers.find((m) => m.id === u.id)
  );

  const mutation = useMutation({
    mutationFn: (payload: CreateChannelPayload) =>
      fetchApi<{ success: boolean; data: Channel }>('/api/chat/channels', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      if (res.success && res.data) {
        onCreated(res.data);
        handleClose();
      }
    },
  });

  const handleClose = useCallback(() => {
    setName('');
    setType('PUBLIC');
    setDescription('');
    setMemberSearch('');
    setSelectedMembers([]);
    setNameError(null);
    onClose();
  }, [onClose]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError) setNameError(null);
  };

  const handleSubmit = () => {
    const error = validateChannelName(name);
    if (error) {
      setNameError(error);
      return;
    }
    mutation.mutate({
      name: slug,
      type,
      description: description.trim() || undefined,
      memberIds: selectedMembers.map((m) => m.id),
    });
  };

  const addMember = (user: User) => {
    setSelectedMembers((prev) => [...prev, user]);
    setMemberSearch('');
  };

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">Create a channel</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Channel Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Channel name <span className="text-destructive">*</span>
            </label>
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border bg-background transition-colors',
                nameError ? 'border-destructive' : 'border-input focus-within:border-ring'
              )}
            >
              <span className="text-muted-foreground font-medium text-sm">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. announcements"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                maxLength={80}
              />
            </div>
            {slug && name && (
              <p className="text-xs text-muted-foreground mt-1">
                Channel will be created as{' '}
                <span className="font-mono font-medium text-foreground">#{slug}</span>
              </p>
            )}
            {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
          </div>

          {/* Channel Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Channel type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType('PUBLIC')}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors',
                  type === 'PUBLIC'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    type === 'PUBLIC' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Hash className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Public</p>
                  <p className="text-xs text-muted-foreground">Anyone can join</p>
                </div>
              </button>
              <button
                onClick={() => setType('PRIVATE')}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors',
                  type === 'PRIVATE'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    type === 'PRIVATE' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Private</p>
                  <p className="text-xs text-muted-foreground">Invite only</p>
                </div>
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none outline-none focus:border-ring transition-colors placeholder:text-muted-foreground"
              maxLength={250}
            />
            <p className="text-xs text-muted-foreground text-right mt-0.5">{description.length}/250</p>
          </div>

          {/* Invite Members */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Invite members{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>

            {/* Selected members tags */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedMembers.map((member) => (
                  <span
                    key={member.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={member.name} className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {member.name}
                    <button
                      onClick={() => removeMember(member.id)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background focus-within:border-ring transition-colors">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchLoading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
              </div>

              {/* Suggestions dropdown */}
              {memberSearch.trim() && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                  {suggestions.slice(0, 8).map((user) => (
                    <button
                      key={user.id}
                      onClick={() => addMember(user)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                    >
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {memberSearch.trim() && !searchLoading && suggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">No users found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Mutation error */}
          {mutation.isError && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
              {(mutation.error as Error)?.message || 'Failed to create channel. Please try again.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !name.trim()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              mutation.isPending || !name.trim()
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Channel
          </button>
        </div>
      </div>
    </div>
  );
}
