'use client';

import { useMemo, useState } from 'react';
import { Hash, Lock, MessageSquarePlus, Pin, Plus, Sparkles, VolumeX } from 'lucide-react';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { usePresenceStore } from '@/store/presence.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { Channel } from '@comms/types';
import { InviteModal } from './invite-modal';
import { CreateChannelDialog } from './create-channel-dialog';
import { ContextSearch, PresenceAvatar } from '@/components/workspace/dsv-shell';

function resolveChannelPreview(channel: Channel) {
  if (channel.type === 'ANNOUNCEMENT') return 'Read-only space for important company updates';
  if (channel.type === 'PRIVATE') return 'Private channel · invite-only';
  if (channel.type === 'GROUP_DM') return 'Group conversation';
  if (channel.type === 'DM') return 'Direct conversation';
  return channel.description || channel.topic || 'Team collaboration space';
}

export function Sidebar() {
  return <SidebarContent compact={false} />;
}

export function SidebarContent({ compact = false }: { compact?: boolean }) {
  const { user } = useAuthStore();
  const { members } = useWorkspaceStore();
  const { getStatus } = usePresenceStore();
  const {
    channels,
    activeChannelId,
    openChannelIds,
    setActiveChannel,
    setChannels,
    unreadCounts,
    pinnedChannelIds,
    togglePinnedChannel,
  } = useChatStore();

  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [startingDm, setStartingDm] = useState<string | null>(null);

  const filteredChannels = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return channels;
    return channels.filter((channel) => {
      const preview = resolveChannelPreview(channel).toLowerCase();
      return channel.name.toLowerCase().includes(query) || preview.includes(query);
    });
  }, [channels, search]);

  const starred = filteredChannels.filter((channel) => pinnedChannelIds.includes(channel.id));
  const general = filteredChannels.filter((channel) => channel.isDefault);
  const projectChannels = filteredChannels.filter(
    (channel) => !channel.isDefault && ['PUBLIC', 'PRIVATE', 'ANNOUNCEMENT'].includes(channel.type)
  );
  const dmChannels = filteredChannels.filter((channel) => ['DM', 'GROUP_DM'].includes(channel.type));

  const resolveDmParticipant = (channel: Channel) => {
    const participantProfiles = channel.participantProfiles || [];
    const otherParticipant = participantProfiles.find((participant) => participant.id !== user?.id);
    if (otherParticipant) return otherParticipant;
    const otherParts = channel.name?.split('-') || [];
    const otherId = otherParts.find((part) => part !== 'dm' && part !== user?.id);
    return otherId ? members.find((member) => member.id === otherId) || null : null;
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
        const exists = channels.some((channel) => channel.id === res.data.id);
        if (!exists) {
          setChannels([...channels, res.data]);
        }
        setActiveChannel(res.data.id);
      }
    } finally {
      setStartingDm(null);
    }
  };

  const topMembers = compact ? members.slice(0, 4) : members.slice(0, 6);

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.98))] px-3 py-4 transition-all duration-200 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.92))] ${
        compact ? 'w-[216px]' : 'w-[252px]'
      }`}
    >
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Workspace</p>
        <h2 className={`mt-1 font-semibold text-foreground ${compact ? 'text-lg' : 'text-xl'}`}>
          {user?.tenant?.name || 'DSV Connect'}
        </h2>
        {!compact ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Curated spaces, direct conversations, and active workstreams.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Focused collaboration.</p>
        )}
      </div>

      <div className="mb-4">
        <ContextSearch
          placeholder="Search chats, channels, people"
          rightLabel="cmd+k"
          value={search}
          onChange={setSearch}
        />
      </div>

      <div className="dsv-scroll flex-1 space-y-4 overflow-y-auto pr-1">
        {starred.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Starred</p>
              <Pin className="h-3.5 w-3.5 text-[#7C3AED]" />
            </div>
            <div className="space-y-2">
              {starred.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`flex w-full items-center gap-3 rounded-[20px] border px-3 ${compact ? 'py-2.5' : 'py-3'} text-left transition-all duration-150 ${
                    activeChannelId === channel.id
                      ? 'border-primary/20 bg-[linear-gradient(135deg,rgba(26,86,219,0.14),rgba(124,58,237,0.08))] shadow-[0_14px_28px_rgba(26,86,219,0.10)]'
                      : 'border-border/50 bg-white/75 hover:border-primary/15 hover:bg-white dark:bg-slate-950/45'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7C3AED]/10 text-[#7C3AED]">
                    {channel.type === 'PRIVATE' ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{channel.name}</p>
                      {openChannelIds.includes(channel.id) ? (
                        <span className="rounded-full bg-[#1A56DB]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1A56DB]">
                          Open
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{resolveChannelPreview(channel)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Channels</p>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-white/80 text-muted-foreground transition-colors hover:text-primary dark:bg-slate-950/60"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {[...general, ...projectChannels].map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={`group flex w-full items-center gap-3 rounded-[20px] border px-3 ${compact ? 'py-2.5' : 'py-3'} text-left transition-all duration-150 ${
                  activeChannelId === channel.id
                    ? 'border-primary/20 bg-[linear-gradient(135deg,rgba(26,86,219,0.14),rgba(124,58,237,0.08))] shadow-[0_14px_28px_rgba(26,86,219,0.10)]'
                    : 'border-transparent hover:border-border/70 hover:bg-white/80 dark:hover:bg-slate-950/50'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary shadow-[0_4px_12px_rgba(0,0,0,0.05)] dark:bg-slate-950">
                  {channel.type === 'PRIVATE' ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{channel.name}</p>
                    {channel.isReadOnly ? <VolumeX className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    {unreadCounts[channel.id] ? (
                      <span className="badge-pulse rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                        {unreadCounts[channel.id]}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{resolveChannelPreview(channel)}</p>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePinnedChannel(channel.id);
                  }}
                  className={`opacity-0 transition-opacity group-hover:opacity-100 ${
                    pinnedChannelIds.includes(channel.id) ? 'opacity-100' : ''
                  }`}
                >
                  <Pin className={`h-4 w-4 ${pinnedChannelIds.includes(channel.id) ? 'text-[#7C3AED]' : 'text-muted-foreground'}`} />
                </button>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Direct messages</p>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1 rounded-xl border border-border bg-white/80 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary dark:bg-slate-950/60"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
          <div className="space-y-2">
            {dmChannels.map((channel) => {
              const participant = resolveDmParticipant(channel);
              const name = participant?.name?.trim() || participant?.email?.split('@')[0] || channel.name;
              const status = participant?.id ? (getStatus(participant.id) || participant.status) : 'OFFLINE';
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`flex w-full items-center gap-3 rounded-[20px] border px-3 ${compact ? 'py-2.5' : 'py-3'} text-left transition-all duration-150 ${
                    activeChannelId === channel.id
                      ? 'border-primary/20 bg-[linear-gradient(135deg,rgba(26,86,219,0.14),rgba(124,58,237,0.08))] shadow-[0_14px_28px_rgba(26,86,219,0.10)]'
                      : 'border-transparent hover:border-border/70 hover:bg-white/80 dark:hover:bg-slate-950/50'
                  }`}
                >
                  <PresenceAvatar name={name} src={participant?.avatarUrl} status={status as any} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{name}</p>
                      {unreadCounts[channel.id] ? (
                        <span className="badge-pulse rounded-full bg-[#7C3AED] px-2 py-0.5 text-[10px] font-semibold text-white">
                          {unreadCounts[channel.id]}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{resolveChannelPreview(channel)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">People</p>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="space-y-2">
            {topMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleStartDm(member.id)}
                className={`flex w-full items-center gap-3 rounded-[20px] border border-transparent px-3 ${compact ? 'py-2.5' : 'py-3'} text-left transition-colors hover:border-border/70 hover:bg-white/80 dark:hover:bg-slate-950/50`}
                disabled={startingDm === member.id}
              >
                <PresenceAvatar name={member.name} src={member.avatarUrl} status={(getStatus(member.id) || member.status) as any} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.jobTitle || member.email}</p>
                </div>
                {startingDm === member.id ? (
                  <span className="text-[11px] text-primary">Opening…</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className={`mt-4 rounded-[24px] border border-border/70 bg-white/82 ${compact ? 'p-3.5' : 'p-4'} shadow-[0_16px_30px_rgba(15,23,42,0.06)] dark:bg-slate-950/60`}>
        <div className="flex items-center gap-3">
          <PresenceAvatar name={user?.name || 'User'} src={user?.avatarUrl} status="ONLINE" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.jobTitle || 'Active in workspace'}</p>
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className={`mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 ${compact ? 'py-2.5 text-[13px]' : 'py-3 text-sm'} font-medium text-white transition-colors hover:bg-primary/90`}
        >
          Invite people
        </button>
      </div>

      {showInvite ? <InviteModal onClose={() => setShowInvite(false)} /> : null}
      <CreateChannelDialog
        open={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        onCreated={(channel) => {
          setChannels([...channels, channel]);
          setActiveChannel(channel.id);
          setShowCreateChannel(false);
        }}
      />
    </aside>
  );
}
