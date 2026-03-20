'use client';

import { useState } from 'react';
import { X, UserPlus, Mail, User, Check, Copy, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchApi } from '@/lib/utils';

interface InviteModalProps {
  onClose: () => void;
}

export function InviteModal({ onClose }: InviteModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ tempPassword: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
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
      <div className="w-[480px] bg-card border border-border rounded-2xl shadow-2xl animate-fadeIn">
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

        <div className="p-6">
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
            <div className="space-y-4">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
