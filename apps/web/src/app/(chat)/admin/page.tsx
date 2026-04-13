'use client';

import { useMemo, useState } from 'react';
import { GripVertical, Plus, ShieldCheck, Upload } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { FloatingHeader, ScreenSection, StatCard } from '@/components/workspace/dsv-shell';

const tabs = ['Users', 'Channels', 'Roles & Permissions', 'Billing', 'Integrations', 'Audit Log'] as const;

const permissions = [
  { role: 'Owner', rights: ['Manage billing', 'Delete workspaces', 'Assign admins'] },
  { role: 'Admin', rights: ['Invite users', 'Create channels', 'Review audit log'] },
  { role: 'Manager', rights: ['Approve access', 'Pin announcements', 'Launch calls'] },
];

export default function AdminPage() {
  const members = useWorkspaceStore((state) => state.members);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Users');

  const stats = useMemo(() => {
    const totalUsers = members.length || 26;
    const activeToday = members.filter((member) => member.status === 'ONLINE').length || 14;
    return {
      totalUsers,
      activeToday,
      channels: 18,
      storageUsed: '148 GB',
    };
  }, [members]);

  return (
    <div className="space-y-5">
      <FloatingHeader
        title="Admin Panel"
        subtitle="Enterprise controls for access, governance, billing, and operational oversight."
        actions={
          <>
            <button className="rounded-full border border-border bg-white/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/20 hover:text-primary dark:bg-slate-950/80">
              <Upload className="mr-2 inline h-4 w-4" />
              Import CSV
            </button>
            <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
              <Plus className="mr-2 inline h-4 w-4" />
              Invite users
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={String(stats.totalUsers)} delta="+4 this week" accent="blue" />
        <StatCard label="Active today" value={String(stats.activeToday)} delta="54% adoption" accent="green" />
        <StatCard label="Channels" value={String(stats.channels)} delta="3 archived" accent="violet" />
        <StatCard label="Storage used" value={stats.storageUsed} delta="74% of plan" accent="amber" />
      </div>

      <div className="dsv-card p-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                tab === item ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === 'Users' ? (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-border/70">
            <div className="grid grid-cols-[minmax(0,1.6fr)_120px_120px_140px_110px] gap-3 border-b border-border bg-muted/35 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span>User</span>
              <span>Role</span>
              <span>Status</span>
              <span>Department</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border/70 bg-card">
              {(members.length ? members : [
                { id: '1', name: 'Kedar Kumbhar', email: 'kedar@dsvconnect.com', role: 'OWNER', status: 'ONLINE', department: 'Leadership' },
                { id: '2', name: 'Pradip Salunkhe', email: 'pradip@dsvconnect.com', role: 'ADMIN', status: 'ONLINE', department: 'Engineering' },
                { id: '3', name: 'Aisha Patel', email: 'aisha@dsvconnect.com', role: 'MEMBER', status: 'AWAY', department: 'Design' },
              ] as any[]).map((member) => (
                <div key={member.id} className="grid grid-cols-[minmax(0,1.6fr)_120px_120px_140px_110px] gap-3 px-5 py-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{member.name}</p>
                    <p className="truncate text-muted-foreground">{member.email}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-center text-xs font-medium text-primary">{member.role}</span>
                  <span className="rounded-full bg-[#0E9F6E]/10 px-2.5 py-1 text-center text-xs font-medium text-[#0E9F6E]">{member.status}</span>
                  <span className="text-muted-foreground">{member.department || 'Operations'}</span>
                  <button className="text-right text-xs font-medium text-primary">Manage</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'Roles & Permissions' ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {permissions.map((item) => (
              <div key={item.role} className="rounded-[24px] border border-border/70 bg-muted/25 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-base font-semibold">{item.role}</p>
                      <p className="text-xs text-muted-foreground">Permission cluster</p>
                    </div>
                  </div>
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-4 space-y-2">
                  {item.rights.map((right) => (
                    <div key={right} className="rounded-2xl bg-card px-3 py-2 text-sm text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                      {right}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'Audit Log' ? (
          <div className="mt-5 space-y-3">
            {[
              'Kedar granted Admin access to Pradip Salunkhe',
              'Aisha created #q2-rollout and invited 8 members',
              'Billing plan changed from Pro to Enterprise sandbox',
            ].map((event) => (
              <div key={event} className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-4 text-sm text-foreground">
                {event}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ScreenSection
        eyebrow="Operations"
        title="Admin experience"
        description="The production version should layer real CSV import, invite flow, billing, and audit filters on top of this cleaner enterprise shell."
      >
        <div className="rounded-[24px] border border-dashed border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">
          This surface now gives you a clear management foundation instead of hiding admin functions in the rest of the app. We can keep extending it with real integrations and role logic without redesigning the shell again.
        </div>
      </ScreenSection>
    </div>
  );
}
