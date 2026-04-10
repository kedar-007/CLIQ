'use client';

import { useState } from 'react';
import {
  Hash, Lock, Plus, ChevronDown, ChevronRight,
  Circle, Video, MessageSquarePlus, Search, Bell, AtSign, UserPlus, Pin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { usePresenceStore } from '@/store/presence.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { fetchApi } from '@/lib/utils';
import { InviteModal } from './invite-modal';
import type { Channel } from '@comms/types';

interface CreateChannelForm {
  name: string;
  type: 'PUBLIC' | 'PRIVATE';
  description: string;
}

export function Sidebar() {
  const {
    channels,
    activeChannelId,
    setActiveChannel,
    unreadCounts,
    setChannels,
    pinnedChannelIds,
    togglePinnedChannel,
    openChannelIds,
  } = useChatStore();
  const { user } = useAuthStore();
  const { getStatus } = usePresenceStore();
  const { members } = useWorkspaceStore();
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmOpen, setDmOpen] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [createForm, setCreateForm] = useState<CreateChannelForm>({ name: '', type: 'PUBLIC', description: '' });
  const [creating, setCreating] = useState(false);
  const [startingDm, setStartingDm] = useState<string | null>(null);

  const publicChannels = channels.filter(c => ['PUBLIC', 'ANNOUNCEMENT'].includes(c.type));
  const privateChannels = channels.filter(c => c.type === 'PRIVATE');
  const dmChannels = channels.filter(c => ['DM', 'GROUP_DM'].includes(c.type));
  const pinnedChannels = channels.filter((channel) => pinnedChannelIds.includes(channel.id));

  const statusColors: Record<string, string> = {
    ONLINE: 'bg-emerald-400',
    AWAY: 'bg-amber-400',
    DND: 'bg-red-400',
    OFFLINE: 'bg-slate-500',
  };

  const resolveDmParticipant = (channel: Channel) => {
    const participantProfiles = channel.participantProfiles || [];
    const otherParticipant = participantProfiles.find((participant) => participant.id !== user?.id);
    if (otherParticipant) return otherParticipant;

    const otherParts = channel.name?.split('-') || [];
    const otherId = otherParts.find((part) => part !== 'dm' && part !== user?.id);
    return otherId ? members.find((member) => member.id === otherId) || null : null;
  };

  const handleCreateChannel = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetchApi<{ success: boolean; data: Channel }>('/api/chat/channels', {
        method: 'POST',
        body: JSON.stringify({ name: createForm.name.trim(), type: createForm.type, description: createForm.description }),
      });
      if (res.success) {
        setChannels([...channels, res.data]);
        setActiveChannel(res.data.id);
        setShowCreateChannel(false);
        setCreateForm({ name: '', type: 'PUBLIC', description: '' });
      }
    } catch {
      // silent fail
    } finally {
      setCreating(false);
    }
  };

  const handleStartDm = async (targetUserId: string) => {
    if (startingDm === targetUserId) return;
    setStartingDm(targetUserId);
    try {
      const res = await fetchApi<{ success: boolean; data: Channel }>('/api/chat/dm', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      if (res.success && res.data) {
        const dmChannel = res.data;
        const alreadyExists = channels.some(c => c.id === dmChannel.id);
        if (!alreadyExists) {
          setChannels([...channels, dmChannel]);
        }
        setActiveChannel(dmChannel.id);
      }
    } catch {
      // silent fail
    } finally {
      setStartingDm(null);
    }
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div
      className="w-[240px] flex-shrink-0 flex flex-col h-full overflow-hidden"
      style={{ background: 'hsl(var(--sidebar-background))' }}
    >
      {/* Workspace header */}
      <div
        className="px-3.5 py-3 flex items-center justify-between flex-shrink-0 cursor-pointer hover:brightness-110 transition-all"
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-xs font-bold text-white">
            {user?.tenant?.name?.charAt(0)?.toUpperCase() || 'W'}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))] truncate leading-tight">
              {user?.tenant?.name || 'Workspace'}
            </h2>
            <p className="text-[10px] text-[hsl(var(--sidebar-foreground))/0.5] leading-tight">
              {user?.tenant?.plan || 'FREE'} plan
            </p>
          </div>
        </div>
        <ChevronDown size={14} className="text-[hsl(var(--sidebar-foreground))/0.5] flex-shrink-0" />
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{ background: 'hsl(var(--sidebar-accent))', color: 'hsl(var(--sidebar-foreground) / 0.6)' }}>
          <Search size={12} />
          <span>Search</span>
          <kbd className="ml-auto text-[10px] opacity-50 bg-black/20 rounded px-1 py-0.5">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 sidebar-scroll">
        {pinnedChannels.length > 0 && (
          <div className="mb-1">
            <div
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'hsl(var(--sidebar-foreground) / 0.5)' }}
            >
              <Pin size={11} className="flex-shrink-0" />
              <span className="flex-1 text-left">Pinned</span>
            </div>
            {pinnedChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                unread={unreadCounts[channel.id] || 0}
                onClick={() => setActiveChannel(channel.id)}
                isPinned
                isOpen={openChannelIds.includes(channel.id)}
                onTogglePin={() => togglePinnedChannel(channel.id)}
              />
            ))}
          </div>
        )}

        {/* Channels section */}
        <div className="mb-1">
          <button
            onClick={() => setChannelsOpen(v => !v)}
            className="w-full flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors group"
            style={{ color: 'hsl(var(--sidebar-foreground) / 0.5)' }}
          >
            {channelsOpen
              ? <ChevronDown size={11} className="flex-shrink-0" />
              : <ChevronRight size={11} className="flex-shrink-0" />
            }
            <span className="flex-1 text-left">Channels</span>
            <button
              onClick={e => { e.stopPropagation(); setShowCreateChannel(true); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all"
              title="Create channel"
            >
              <Plus size={13} />
            </button>
          </button>

          {channelsOpen && (
            <>
              {[...publicChannels, ...privateChannels].map(ch => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  isActive={activeChannelId === ch.id}
                  unread={unreadCounts[ch.id] || 0}
                  onClick={() => setActiveChannel(ch.id)}
                  isPinned={pinnedChannelIds.includes(ch.id)}
                  isOpen={openChannelIds.includes(ch.id)}
                  onTogglePin={() => togglePinnedChannel(ch.id)}
                />
              ))}
              <button
                onClick={() => setShowCreateChannel(true)}
                className="w-full flex items-center gap-2 px-3 py-1 text-xs rounded-lg mx-1 transition-colors"
                style={{ color: 'hsl(var(--sidebar-foreground) / 0.45)', width: 'calc(100% - 8px)' }}
              >
                <Plus size={13} />
                <span>Add channels</span>
              </button>
            </>
          )}
        </div>

        {/* DMs section */}
        <div className="mt-2">
          <button
            onClick={() => setDmOpen(v => !v)}
            className="w-full flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors group"
            style={{ color: 'hsl(var(--sidebar-foreground) / 0.5)' }}
          >
            {dmOpen
              ? <ChevronDown size={11} className="flex-shrink-0" />
              : <ChevronRight size={11} className="flex-shrink-0" />
            }
            <span className="flex-1 text-left">Direct Messages</span>
            <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all">
              <Plus size={13} />
            </button>
          </button>

          {dmOpen && (
            <>
              {dmChannels.map(ch => {
                const otherMember = resolveDmParticipant(ch);
                const displayName = otherMember?.name?.trim() || otherMember?.email?.split('@')[0] || ch.name;
                const status = otherMember ? (getStatus(otherMember.id) || otherMember.status) : 'OFFLINE';
                const statusDot = status === 'ONLINE' ? 'bg-emerald-400' : status === 'AWAY' ? 'bg-amber-400' : 'bg-slate-500';
                const initials = displayName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                const isActive = activeChannelId === ch.id;
                const unread = unreadCounts[ch.id] || 0;
                const isPinned = pinnedChannelIds.includes(ch.id);
                const isOpen = openChannelIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch.id)}
                    className="sidebar-channel-item group w-full flex items-center gap-2 px-3 py-[5px] text-sm rounded-lg relative"
                    style={{
                      margin: '0 4px',
                      width: 'calc(100% - 8px)',
                      background: isActive ? 'hsl(var(--sidebar-primary) / 0.2)' : undefined,
                      color: isActive || unread > 0 ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--sidebar-foreground) / 0.65)',
                      fontWeight: unread > 0 ? 600 : undefined,
                    }}
                  >
                    {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full" style={{ background: 'hsl(var(--sidebar-primary))' }} />}
                    <div className="relative flex-shrink-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-[10px] font-semibold text-white">
                        {initials}
                      </div>
                      <span className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-[hsl(var(--sidebar-background))]', statusDot)} />
                    </div>
                    <span className="truncate flex-1 text-left text-xs">{displayName}</span>
                    {isOpen && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/90" title="Open in workspace" />
                    )}
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePinnedChannel(ch.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          togglePinnedChannel(ch.id);
                        }
                      }}
                      className={cn(
                        'rounded-md p-1 transition-opacity',
                        isPinned ? 'opacity-100 text-amber-400' : 'opacity-0 text-muted-foreground group-hover:opacity-100'
                      )}
                      title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    >
                      <Pin size={12} />
                    </span>
                    {unread > 0 && !isActive && (
                      <span className="flex-shrink-0 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                        style={{ background: 'hsl(var(--sidebar-primary))', color: 'hsl(var(--sidebar-primary-foreground))' }}>
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}
              {dmChannels.length === 0 && (
                <p className="px-4 py-1.5 text-xs" style={{ color: 'hsl(var(--sidebar-foreground) / 0.35)' }}>
                  Click a person below to start a DM
                </p>
              )}
            </>
          )}
        </div>

        {/* People section */}
        {members.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setPeopleOpen(v => !v)}
              className="w-full flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors group"
              style={{ color: 'hsl(var(--sidebar-foreground) / 0.5)' }}
            >
              {peopleOpen
                ? <ChevronDown size={11} className="flex-shrink-0" />
                : <ChevronRight size={11} className="flex-shrink-0" />
              }
              <span className="flex-1 text-left">People</span>
            </button>

            {peopleOpen && members
              .filter(m => m.id !== user?.id)
              .map(member => {
                const status = getStatus(member.id) || member.status || 'OFFLINE';
                const statusColor =
                  status === 'ONLINE' ? 'bg-emerald-400' :
                  status === 'AWAY' ? 'bg-amber-400' :
                  status === 'DND' ? 'bg-red-400' :
                  'bg-slate-500';
                const initials = member.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                const isLoading = startingDm === member.id;

                return (
                  <button
                    key={member.id}
                    onClick={() => handleStartDm(member.id)}
                    disabled={isLoading}
                    className="sidebar-channel-item w-full flex items-center gap-2 px-3 py-[5px] text-sm rounded-lg relative disabled:opacity-60"
                    style={{
                      margin: '0 4px',
                      width: 'calc(100% - 8px)',
                      color: 'hsl(var(--sidebar-foreground) / 0.65)',
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      {member.avatarUrl
                        ? <img src={member.avatarUrl} alt={member.name} className="w-6 h-6 rounded-full object-cover" />
                        : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-[10px] font-semibold text-white">
                            {initials}
                          </div>
                        )
                      }
                      <span className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[hsl(var(--sidebar-background))]',
                        statusColor
                      )} />
                    </div>
                    <span className="truncate flex-1 text-left text-xs">{member.name}</span>
                  </button>
                );
              })
            }
          </div>
        )}
      </nav>

      {/* Invite people button */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        <button
          onClick={() => setShowInvite(true)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{ color: 'hsl(var(--sidebar-foreground) / 0.65)', background: 'hsl(var(--sidebar-accent))' }}
        >
          <UserPlus size={12} />
          <span>Invite people</span>
        </button>
      </div>

      {/* User profile footer */}
      <div className="px-2 py-2 flex-shrink-0">
        <button className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:brightness-110 transition-all">
          <div className="relative flex-shrink-0">
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
              : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-xs font-semibold text-white">
                  {initials}
                </div>
              )
            }
            <span className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[hsl(var(--sidebar-background))]',
              statusColors[getStatus(user?.id || '')] || 'bg-slate-500'
            )} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate leading-tight" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
              {user?.name}
            </p>
            <p className="text-[11px] truncate leading-tight" style={{ color: 'hsl(var(--sidebar-foreground) / 0.5)' }}>
              {user?.customStatusText || (getStatus(user?.id || '') === 'ONLINE' ? 'Active' : 'Away')}
            </p>
          </div>
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[440px] bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fadeIn">
            <h3 className="text-lg font-semibold mb-1">Create a channel</h3>
            <p className="text-sm text-muted-foreground mb-5">Channels are where your team communicates.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Channel name</label>
                <div className="flex items-center gap-2 px-3 py-2.5 border border-input rounded-xl bg-background">
                  <Hash size={15} className="text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                    placeholder="e.g. marketing"
                    className="flex-1 bg-transparent outline-none text-sm"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What's this channel about?"
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Visibility</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'PUBLIC' as const, label: 'Public', desc: 'Anyone in workspace', icon: Hash },
                    { value: 'PRIVATE' as const, label: 'Private', desc: 'Only invited members', icon: Lock },
                  ].map(({ value, label, desc, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setCreateForm(f => ({ ...f, type: value }))}
                      className={cn(
                        'flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors',
                        createForm.type === value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-border/80 hover:bg-accent'
                      )}
                    >
                      <Icon size={16} className={createForm.type === value ? 'text-primary mt-0.5' : 'text-muted-foreground mt-0.5'} />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={() => setShowCreateChannel(false)}
                className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={!createForm.name.trim() || creating}
                className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              >
                {creating ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelItem({
  channel, isActive, unread, onClick, isDm = false, isPinned = false, isOpen = false, onTogglePin
}: {
  channel: Channel;
  isActive: boolean;
  unread: number;
  onClick: () => void;
  isDm?: boolean;
  isPinned?: boolean;
  isOpen?: boolean;
  onTogglePin?: () => void;
}) {
  const isPrivate = channel.type === 'PRIVATE';
  const isAnnouncement = channel.type === 'ANNOUNCEMENT';

  const Icon = isDm ? Circle : isPrivate ? Lock : isAnnouncement ? AtSign : Hash;

  return (
    <button
      onClick={onClick}
      className="sidebar-channel-item group w-full flex items-center gap-2 px-3 py-[5px] text-sm rounded-lg relative"
      style={{
        margin: '0 4px',
        width: 'calc(100% - 8px)',
        background: isActive ? 'hsl(var(--sidebar-primary) / 0.2)' : undefined,
        color: isActive || unread > 0
          ? 'hsl(var(--sidebar-foreground))'
          : 'hsl(var(--sidebar-foreground) / 0.65)',
        fontWeight: unread > 0 ? 600 : undefined,
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full"
          style={{ background: 'hsl(var(--sidebar-primary))' }}
        />
      )}
      <Icon
        size={isDm ? 6 : 14}
        className={cn('flex-shrink-0', isDm && 'fill-current')}
        strokeWidth={isDm ? 0 : isActive ? 2.2 : 1.8}
      />
      <span className="truncate flex-1 text-left">{channel.name}</span>
      {isOpen && (
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/90" title="Open in workspace" />
      )}
      {onTogglePin && (
        <span
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onTogglePin();
            }
          }}
          className={cn(
            'rounded-md p-1 transition-opacity',
            isPinned ? 'opacity-100 text-amber-400' : 'opacity-0 text-muted-foreground group-hover:opacity-100'
          )}
          title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          <Pin size={12} />
        </span>
      )}
      {unread > 0 && !isActive && (
        <span
          className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: 'hsl(var(--sidebar-primary))', color: 'hsl(var(--sidebar-primary-foreground))' }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
