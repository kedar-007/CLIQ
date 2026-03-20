'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { X, MessageSquare, Phone, Pencil, Check, Loader2, Circle } from 'lucide-react';
import { fetchApi, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { usePresenceStore } from '@/store/presence.store';
import type { User } from '@comms/types';

interface UserProfileDialogProps {
  userId: string;
  open: boolean;
  onClose: () => void;
}

interface ProfileFormData {
  name: string;
  jobTitle: string;
  department: string;
  timezone: string;
  bio: string;
}

const statusColors: Record<string, string> = {
  ONLINE: 'bg-emerald-500',
  AWAY: 'bg-amber-500',
  DND: 'bg-red-500',
  OFFLINE: 'bg-slate-400',
};

const statusLabels: Record<string, string> = {
  ONLINE: 'Online',
  AWAY: 'Away',
  DND: 'Do Not Disturb',
  OFFLINE: 'Offline',
};

export function UserProfileDialog({ userId, open, onClose }: UserProfileDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, updateUser } = useAuthStore();
  const { getStatus } = usePresenceStore();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    jobTitle: '',
    department: '',
    timezone: '',
    bio: '',
  });

  const isOwnProfile = currentUser?.id === userId;

  const { data, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchApi<{ success: boolean; data: User }>(`/api/auth/users/${userId}`),
    enabled: open && !!userId,
    onSuccess: (res) => {
      if (res.data) {
        setFormData({
          name: res.data.name || '',
          jobTitle: res.data.jobTitle || '',
          department: res.data.department || '',
          timezone: res.data.timezone || '',
          bio: (res.data as any).bio || '',
        });
      }
    },
  });

  const profile = data?.data;
  const status = getStatus(userId);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<ProfileFormData>) =>
      fetchApi<{ success: boolean; data: User }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      if (res.data) {
        updateUser(res.data);
        queryClient.setQueryData(['user-profile', userId], { success: true, data: res.data });
      }
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      name: formData.name.trim() || undefined,
      jobTitle: formData.jobTitle.trim() || undefined,
      department: formData.department.trim() || undefined,
      timezone: formData.timezone.trim() || undefined,
      bio: formData.bio.trim() || undefined,
    } as any);
  };

  const handleMessage = () => {
    router.push(`/dm/${userId}`);
    onClose();
  };

  const handleCall = () => {
    // Initiate audio call - integrates with call-service via socket
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-card/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Edit / Save toggle (own profile) */}
        {isOwnProfile && (
          <button
            onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
            disabled={saveMutation.isPending}
            className="absolute top-3 right-12 z-10 flex items-center gap-1 p-1.5 rounded-full bg-card/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={isEditing ? 'Save changes' : 'Edit profile'}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isEditing ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <Pencil className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Banner / Avatar */}
        <div className="h-20 bg-gradient-to-br from-primary/30 to-primary/10 flex-shrink-0" />

        <div className="px-5 pb-5">
          {/* Avatar */}
          <div className="relative -mt-10 mb-3">
            {isLoading ? (
              <div className="w-20 h-20 rounded-full bg-muted animate-pulse ring-4 ring-card" />
            ) : profile?.avatarUrl ? (
              <div className="relative inline-block">
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-card"
                />
                <span
                  className={cn(
                    'absolute bottom-1 right-1 w-4 h-4 rounded-full ring-2 ring-card',
                    statusColors[status]
                  )}
                />
              </div>
            ) : (
              <div className="relative inline-block">
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold ring-4 ring-card">
                  {profile?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <span
                  className={cn(
                    'absolute bottom-1 right-1 w-4 h-4 rounded-full ring-2 ring-card',
                    statusColors[status]
                  )}
                />
              </div>
            )}
          </div>

          {/* Name */}
          {isLoading ? (
            <div className="space-y-2 mb-4">
              <div className="h-6 bg-muted rounded animate-pulse w-40" />
              <div className="h-4 bg-muted rounded animate-pulse w-24" />
            </div>
          ) : (
            <div className="mb-4">
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="text-lg font-bold w-full bg-muted rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50 mb-1"
                  placeholder="Display name"
                />
              ) : (
                <h3 className="text-lg font-bold text-foreground">{profile?.name || 'Unknown'}</h3>
              )}

              {/* Status */}
              <div className="flex items-center gap-1.5">
                <Circle className={cn('w-2.5 h-2.5 fill-current', statusColors[status])} />
                <span className="text-sm text-muted-foreground">{statusLabels[status] || 'Offline'}</span>
              </div>

              {/* Custom status */}
              {profile?.customStatusText && !isEditing && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.customStatusEmoji && `${profile.customStatusEmoji} `}
                  {profile.customStatusText}
                </p>
              )}
            </div>
          )}

          {/* Profile Fields */}
          {isLoading ? (
            <div className="space-y-2 mb-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5 mb-5">
              {isEditing ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData((f) => ({ ...f, jobTitle: e.target.value }))}
                      className="w-full text-sm bg-muted rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. Senior Engineer"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                      Department
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData((f) => ({ ...f, department: e.target.value }))}
                      className="w-full text-sm bg-muted rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. Engineering"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                      Timezone
                    </label>
                    <input
                      type="text"
                      value={formData.timezone}
                      onChange={(e) => setFormData((f) => ({ ...f, timezone: e.target.value }))}
                      className="w-full text-sm bg-muted rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. America/New_York"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                      Bio
                    </label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
                      rows={2}
                      className="w-full text-sm bg-muted rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      placeholder="A short bio..."
                      maxLength={200}
                    />
                  </div>
                </>
              ) : (
                <>
                  {profile?.jobTitle && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</p>
                      <p className="text-sm text-foreground">{profile.jobTitle}</p>
                    </div>
                  )}
                  {profile?.department && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</p>
                      <p className="text-sm text-foreground">{profile.department}</p>
                    </div>
                  )}
                  {profile?.timezone && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timezone</p>
                      <p className="text-sm text-foreground">{profile.timezone}</p>
                    </div>
                  )}
                  {(profile as any)?.bio && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bio</p>
                      <p className="text-sm text-foreground leading-relaxed">{(profile as any).bio}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mutation error */}
          {saveMutation.isError && (
            <p className="text-xs text-destructive mb-3">
              {(saveMutation.error as Error)?.message || 'Failed to save changes.'}
            </p>
          )}

          {/* Action Buttons (not own profile) */}
          {!isOwnProfile && (
            <div className="flex gap-2">
              <button
                onClick={handleMessage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Message
              </button>
              <button
                onClick={handleCall}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
                title="Start audio call"
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Edit mode action buttons */}
          {isEditing && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
