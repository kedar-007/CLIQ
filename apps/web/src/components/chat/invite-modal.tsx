'use client';

import { useEffect, useState } from 'react';
import { X, UserPlus, Mail, User, Check, Copy, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

interface InviteModalProps {
  onClose: () => void;
}

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  status: string;
}

export function InviteModal({ onClose }: InviteModalProps) {
  const currentUser = useAuthStore((state) => state.user);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ tempPassword: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMembers = async () => {
      setMembersLoading(true);
      try {
        const res = await fetchApi<{ success: boolean; data: WorkspaceMember[] }>('/api/auth/workspace/members');
        if (isMounted) {
          setMembers(res.data || []);
        }
      } catch {
        if (isMounted) {
          setMembers([]);
        }
      } finally {
        if (isMounted) {
          setMembersLoading(false);
        }
      }
    };

    void loadMembers();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ success: boolean; data: any; error?: string }>(
        '/api/auth/workspace/members/invite',
        {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
        }
      );
      if (!res.success) {
        setError(res.error || 'Failed to invite member');
        return;
      }
      setSuccess({ tempPassword: res.data.tempPassword, name: res.data.name });
      setMembers((current) => [
        ...current,
        {
          id: res.data.id,
          email: res.data.email,
          name: res.data.name,
          role: res.data.role,
          status: 'OFFLINE',
        },
      ]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMember = async (member: WorkspaceMember) => {
    if (member.id === currentUser?.id) {
      setError('You cannot delete your own account from here.');
      return;
    }

    if (!window.confirm(`Delete "${member.name}" from the workspace? You can invite them again later.`)) {
      return;
    }

    setDeletingUserId(member.id);
    setError('');
    try {
      await fetchApi(`/api/auth/workspace/members/${member.id}`, {
        method: 'DELETE',
      });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      if (email === member.email) {
        setEmail('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete member.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const copyCredentials = () => {
    if (!success) return;
    const text = `You've been invited to the workspace!\n\nEmail: ${email}\nTemporary password: ${success.tempPassword}\n\nPlease log in and change your password.`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[90vh] overflow-hidden bg-card border border-border rounded-2xl shadow-2xl animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">Invite to workspace</h3>
              <p className="text-xs text-muted-foreground">Add a new member to your team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-6">
          {success ? (
            /* Success state */
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h4 className="font-semibold text-lg mb-1">{success.name} added!</h4>
              <p className="text-sm text-muted-foreground mb-5">
                Share these credentials with them to log in.
              </p>

              <div className="bg-muted rounded-xl p-4 text-left space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider mb-0.5">Email</p>
                    <p className="text-sm font-medium">{email}</p>
                  </div>
                </div>
                <div className="border-t border-border pt-2">
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider mb-0.5">Temp Password</p>
                  <p className="text-sm font-mono font-medium">{success.tempPassword}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={copyCredentials}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border hover:bg-accent transition-colors text-sm"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy credentials'}
                </button>
                <button
                  onClick={() => { setSuccess(null); setName(''); setEmail(''); }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  Invite another
                </button>
              </div>
            </div>
          ) : (
            /* Form */
            <div className="space-y-6">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <div>
                <label className="text-sm font-medium block mb-1.5">Full name</label>
                <div className="flex items-center gap-2 px-3 py-2.5 border border-input rounded-xl bg-background focus-within:ring-2 focus-within:ring-ring">
                  <User size={14} className="text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="John Doe"
                    autoFocus
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Email address</label>
                <div className="flex items-center gap-2 px-3 py-2.5 border border-input rounded-xl bg-background focus-within:ring-2 focus-within:ring-ring">
                  <Mail size={14} className="text-muted-foreground flex-shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="flex-1 bg-transparent text-sm outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'MEMBER' as const, label: 'Member', desc: 'Can read and write' },
                    { value: 'ADMIN' as const, label: 'Admin', desc: 'Full access' },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setRole(value)}
                      className={cn(
                        'flex flex-col items-start p-3 rounded-xl border-2 text-left transition-colors',
                        role === value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-border/80 hover:bg-accent'
                      )}
                    >
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border hover:bg-accent transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={!name.trim() || !email.trim() || isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {isLoading ? 'Adding…' : 'Add to workspace'}
                </button>
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Workspace members</h4>
                    <p className="text-xs text-muted-foreground">Delete a test user here, then invite them again.</p>
                  </div>
                  <span className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">
                    {members.length}
                  </span>
                </div>

                {membersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <div className="space-y-1">
                          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                          <div className="h-2.5 w-40 animate-pulse rounded bg-muted" />
                        </div>
                        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    No members found in this workspace yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.name}
                            {member.id === currentUser?.id ? ' (you)' : ''}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                            {member.role}
                          </span>
                          {member.id !== currentUser?.id && (
                            <button
                              onClick={() => handleDeleteMember(member)}
                              disabled={deletingUserId === member.id}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/20 text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                              title="Delete member"
                            >
                              {deletingUserId === member.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
