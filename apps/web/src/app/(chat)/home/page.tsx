'use client';

import { format } from 'date-fns';
import {
  ArrowUpRight,
  FolderOpen,
  MessageSquarePlus,
  Phone,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import {
  FloatingHeader,
  MiniCalendarCard,
  PinnedStrip,
  PresenceAvatar,
  QuickActionBar,
  ScreenSection,
  StatCard,
  TimelineItem,
} from '@/components/workspace/dsv-shell';

const pinnedItems = [
  { id: '1', title: '# executive-briefing', tag: 'Channel' },
  { id: '2', title: 'Aisha Patel', tag: 'Message' },
  { id: '3', title: '# q2-launch', tag: 'Project' },
  { id: '4', title: 'Leadership sync', tag: 'Meeting' },
];

const activityFeed = [
  {
    id: '1',
    title: 'Vaibhav uploaded the final client deck',
    description: 'Shared in #board-updates · “Q2 Transformation Narrative.pdf”',
    time: '8 min ago',
    person: { name: 'Vaibhav Pawar', status: 'ONLINE' as const },
  },
  {
    id: '2',
    title: 'Priya replied in the launch thread',
    description: '“We can ship the rollout notes after the client dry run.”',
    time: '28 min ago',
    person: { name: 'Priya Nair', status: 'AWAY' as const },
  },
  {
    id: '3',
    title: 'Rugved started a team huddle',
    description: 'Product Design · 6 participants joined the ad-hoc call',
    time: '46 min ago',
    person: { name: 'Rugved Mahamuni', status: 'ONLINE' as const },
  },
];

const recentFiles = [
  { id: '1', title: 'Quarterly Business Review.pdf', owner: 'Kedar Kumbhar', time: '12 mins ago' },
  { id: '2', title: 'Product Narrative v6.fig', owner: 'Aisha Patel', time: '38 mins ago' },
  { id: '3', title: 'Data-room checklist.xlsx', owner: 'Pradip Salunkhe', time: '1 hr ago' },
];

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const name = user?.name?.split(' ')[0] || 'there';
  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <div className="space-y-5 md:space-y-6">
      <FloatingHeader
        title={`Good morning, ${name}`}
        subtitle={today}
        sticky={false}
        participants={[
          { id: '1', name: 'Kedar Kumbhar', status: 'ONLINE' },
          { id: '2', name: 'Aisha Patel', status: 'ONLINE' },
          { id: '3', name: 'Pradip Salunkhe', status: 'AWAY' },
          { id: '4', name: 'Rugved Mahamuni', status: 'ONLINE' },
          { id: '5', name: 'Priya Nair', status: 'DND' },
        ]}
        actions={
          <QuickActionBar
            actions={[
              { id: '1', label: 'New Message', icon: <MessageSquarePlus className="h-4 w-4" />, tone: 'blue' },
              { id: '2', label: 'Start Call', icon: <Phone className="h-4 w-4" />, tone: 'green' },
              { id: '3', label: 'Create Channel', icon: <Plus className="h-4 w-4" />, tone: 'violet' },
            ]}
          />
        }
      />

      <ScreenSection eyebrow="Pinned" title="Your priority lane" description="Shortcuts to the conversations and spaces that deserve fast access.">
        <PinnedStrip items={pinnedItems} />
      </ScreenSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Unread messages" value="18" delta="+6 since 9 AM" accent="blue" />
            <StatCard label="Upcoming meetings" value="5" delta="2 this afternoon" accent="green" />
            <StatCard label="Recent files" value="24" delta="7 updated today" accent="violet" />
            <StatCard label="Active channels" value="12" delta="3 high priority" accent="amber" />
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="dsv-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Recent activity</p>
                  <h2 className="mt-1 text-[22px] font-semibold">Team momentum</h2>
                </div>
                <button className="rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  View all
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {activityFeed.map((item) => (
                  <TimelineItem key={item.id} {...item} />
                ))}
              </div>
            </div>

            <div className="dsv-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Recent files</p>
                  <h2 className="mt-1 text-[22px] font-semibold">Latest handoffs</h2>
                </div>
                <button className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Open library
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {recentFiles.map((file) => (
                  <div key={file.id} className="rounded-2xl border border-border/70 bg-muted/40 p-4 transition-colors hover:border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1A56DB]/10 text-[#1A56DB]">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{file.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.owner} · {file.time}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <MiniCalendarCard />

          <div className="dsv-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7C3AED]/10 text-[#7C3AED]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Assistant</p>
                <h3 className="text-lg font-semibold">Suggested next steps</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {[
                'Prepare a project room for the DSV finance migration.',
                'Create a briefing note from yesterday’s leadership thread.',
                'Follow up with 3 teammates who have unread launch tasks.',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  className="flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-white/80 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 dark:bg-slate-950/50"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED]/10 text-[#7C3AED]">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                  <span className="text-sm leading-6 text-foreground">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="dsv-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0E9F6E]/10 text-[#0E9F6E]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Availability</p>
                <h3 className="text-lg font-semibold">People online now</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {[
                { name: 'Kedar Kumbhar', role: 'Founder · India' },
                { name: 'Pradip Salunkhe', role: 'Engineering · Pune' },
                { name: 'Aisha Patel', role: 'Product Design · Dubai' },
              ].map((person) => (
                <div key={person.name} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 px-3 py-3">
                  <PresenceAvatar name={person.name} status="ONLINE" />
                  <div>
                    <p className="text-sm font-semibold">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
