'use client';

import { useEffect, useState } from 'react';
import { X, UserPlus, Crown, Shield, User, Search, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  status: string;
}

interface MembersPanelProps {
  channelId: string;
  channelName?: string;
  onClose: () => void;
  onInvite: () => void;
}

const statusColors: Record<string, string> = {
  ONLINE: 'bg-emerald-400',
  AWAY: 'bg-amber-400',
  DND: 'bg-red-400',
  OFFLINE: 'bg-slate-400',
};

const roleIcons: Record<string, React.ReactNode> = {
  OWNER: <Crown size={11} className="text-amber-400" />,
  ADMIN: <Shield size={11} className="text-blue-400" />,
  MEMBER: null,
};

export function MembersPanel({ channelId, channelName, onClose, onInvite }: MembersPanelProps) {
  const { user: currentUser } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    fetchApi<{ success: boolean; data: Member[] }>(`/api/chat/channels/${channelId}/members`)
      .then(res => setMembers(res.data || []))
      .catch(() => setMembers([]))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  const online = filtered.filter(m => m.status === 'ONLINE');
  const offline = filtered.filter(m => m.status !== 'ONLINE');

  const handleRemove = async (userId: string) => {
    try {
      await fetchApi(`/api/chat/channels/${channelId}/members/${userId}`, { method: 'DELETE' });
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch { /* silent */ }
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const gradients = [
    'from-violet-500 to-indigo-600', 'from-rose-500 to-pink-600',
    'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600',
    'from-sky-500 to-blue-600', 'from-fuchsia-500 to-purple-600',
  ];

  const MemberRow = ({ member }: { member: Member }) => (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors">
      <div className="relative flex-shrink-0">
        {member.avatarUrl
          ? <img src={member.avatarUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
          : (
            <div className={cn(
              'w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-semibold',
              gradients[member.name.charCodeAt(0) % gradients.length]
            )}>
              {initials(member.name)}
            </div>
          )
        }
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-background', statusColors[member.status] || 'bg-slate-400')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{member.name}</span>
          {roleIcons[member.role]}
          {member.id === currentUser?.id && (
            <span className="text-[10px] text-muted-foreground">(you)</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
      </div>
      {member.id !== currentUser?.id && (
        <button
          onClick={() => handleRemove(member.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          title="Remove from channel"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col h-full border-l border-border bg-background animate-slideInRight">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-card/30">
        <div>
          <h3 className="font-semibold text-[15px]">Members</h3>
          {channelName && <p className="text-xs text-muted-foreground">#{channelName}</p>}
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search + invite */}
      <div className="px-3 py-3 space-y-2 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background">
          <Search size={13} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={onInvite}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors text-sm font-medium"
        >
          <UserPlus size={14} />
          Add people
        </button>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded-full w-24" />
                  <div className="h-2.5 bg-muted rounded-full w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <div className="mb-2">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Online — {online.length}
                </p>
                {online.map(m => <MemberRow key={m.id} member={m} />)}
              </div>
            )}
            {offline.length > 0 && (
              <div>
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Offline — {offline.length}
                </p>
                {offline.map(m => <MemberRow key={m.id} member={m} />)}
              </div>
            )}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No members found</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
