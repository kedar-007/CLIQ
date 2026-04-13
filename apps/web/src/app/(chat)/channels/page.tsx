'use client';

import { useMemo, useState } from 'react';
import { Hash, Lock, Pin, Plus, Users } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { FloatingHeader, ScreenSection } from '@/components/workspace/dsv-shell';
import { CreateChannelDialog } from '@/components/chat/create-channel-dialog';

const channelGroups = ['Starred', 'General', 'Projects', 'Teams'] as const;

export default function ChannelsPage() {
  const channels = useChatStore((state) => state.channels);
  const pinnedChannelIds = useChatStore((state) => state.pinnedChannelIds);
  const [tab, setTab] = useState<'messages' | 'files' | 'members' | 'pinned'>('messages');
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  const grouped = useMemo(() => {
    const starred = channels.filter((channel) => pinnedChannelIds.includes(channel.id));
    const general = channels.filter((channel) => channel.isDefault);
    const projects = channels.filter((channel) => !channel.isDefault && channel.type === 'PUBLIC');
    const teams = channels.filter((channel) => channel.type === 'PRIVATE' || channel.type === 'ANNOUNCEMENT');
    return { Starred: starred, General: general, Projects: projects, Teams: teams };
  }, [channels, pinnedChannelIds]);

  const featured = channels[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="dsv-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Spaces</p>
            <h2 className="mt-1 text-lg font-semibold">Channels</h2>
          </div>
          <button
            onClick={() => setShowCreateChannel(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {channelGroups.map((group) => (
            <div key={group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group}</p>
              <div className="space-y-2">
                {grouped[group].map((channel) => (
                  <button
                    key={channel.id}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 px-3 py-3 text-left transition-colors hover:border-primary/20 hover:bg-card"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary shadow-[0_4px_12px_rgba(0,0,0,0.05)] dark:bg-slate-950">
                      {channel.type === 'PRIVATE' ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{channel.name}</p>
                        {pinnedChannelIds.includes(channel.id) ? <Pin className="h-3.5 w-3.5 text-[#7C3AED]" /> : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{channel.description || 'Private collaboration space'}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                      {channel.memberCount || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="space-y-5">
        <FloatingHeader
          title={featured ? `# ${featured.name}` : 'Channels'}
          subtitle={featured?.description || 'Project rooms, shared announcements, and team spaces.'}
          actions={
            <>
              <button className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/20 hover:text-primary dark:bg-slate-950/70">
                <Users className="mr-2 inline h-4 w-4" />
                {featured?.memberCount || 0} members
              </button>
              <button className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/20 hover:text-primary dark:bg-slate-950/70">
                <Pin className="mr-2 inline h-4 w-4" />
                Pinned messages
              </button>
            </>
          }
        />

        <div className="dsv-card p-5">
          <div className="flex flex-wrap gap-2">
            {[
              ['messages', 'Messages'],
              ['files', 'Files'],
              ['members', 'Members'],
              ['pinned', 'Pinned'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value as typeof tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  tab === value
                    ? 'bg-primary text-white shadow-[0_10px_22px_rgba(26,86,219,0.22)]'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-border bg-muted/30 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Topic</p>
              <h3 className="mt-2 text-lg font-semibold">{featured?.topic || 'Cross-functional program updates'}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A dedicated space for project milestones, launch planning, files, and member alignment. Keep strategic communication tidy and discoverable.
              </p>
            </div>
            <div className="rounded-[24px] border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Create channel</p>
              <h3 className="mt-2 text-lg font-semibold">Spin up a new team space</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use a lightweight slide-over flow for channel name, topic, privacy, and invite list.
              </p>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="mt-4 inline-flex items-center rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Channel
              </button>
            </div>
          </div>
        </div>
      </section>

      <CreateChannelDialog
        open={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        onCreated={() => setShowCreateChannel(false)}
      />
    </div>
  );
}
