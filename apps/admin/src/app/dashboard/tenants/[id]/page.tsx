'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Users,
  Hash,
  MessageSquare,
  HardDrive,
  Ban,
  Trash2,
  CheckCircle,
  Building2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { adminApi } from '@/lib/api';
import { cn, planBadgeColor, statusBadgeColor, formatBytes } from '@/lib/utils';

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSeen: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  resource: string;
  createdAt: string;
  ipAddress: string;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  dataRegion: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    userCount: number;
    channelCount: number;
    messageCount: number;
    storageBytes: number;
  };
  users: TenantUser[];
  auditLogs: AuditLog[];
}

const MOCK_TENANT: TenantDetail = {
  id: '1',
  name: 'Acme Corp',
  slug: 'acme',
  plan: 'ENTERPRISE',
  status: 'ACTIVE',
  dataRegion: 'US',
  createdAt: new Date(2023, 5, 15).toISOString(),
  updatedAt: new Date(2024, 0, 10).toISOString(),
  stats: {
    userCount: 523,
    channelCount: 87,
    messageCount: 1_248_432,
    storageBytes: 32 * 1024 * 1024 * 1024,
  },
  users: Array.from({ length: 8 }, (_, i) => ({
    id: `u${i}`,
    name: ['Alice Johnson', 'Bob Smith', 'Carol White', 'Dave Brown', 'Eve Davis', 'Frank Miller', 'Grace Wilson', 'Henry Moore'][i],
    email: ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'henry'][i] + '@acmecorp.com',
    role: i === 0 ? 'OWNER' : i < 3 ? 'ADMIN' : 'MEMBER',
    status: i === 5 ? 'SUSPENDED' : 'ACTIVE',
    lastSeen: i < 5 ? new Date(2024, 0, 20 - i).toISOString() : null,
  })),
  auditLogs: Array.from({ length: 8 }, (_, i) => ({
    id: `log${i}`,
    action: ['USER_CREATED', 'CHANNEL_CREATED', 'USER_SUSPENDED', 'PLAN_CHANGED', 'USER_DELETED', 'CHANNEL_ARCHIVED', 'ROLE_CHANGED', 'SETTINGS_UPDATED'][i],
    userId: `u${i % 3}`,
    userName: ['Alice Johnson', 'Bob Smith', 'Carol White'][i % 3],
    resource: ['User', 'Channel', 'User', 'Billing', 'User', 'Channel', 'User', 'Settings'][i],
    createdAt: new Date(2024, 0, 20 - i * 2).toISOString(),
    ipAddress: `192.168.1.${100 + i}`,
  })),
};

function StatMini({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [userSearch, setUserSearch] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => adminApi.getTenant(id).then((r) => r.data),
    retry: false,
  });

  const tenant: TenantDetail = data || MOCK_TENANT;

  const suspendMutation = useMutation({
    mutationFn: () => adminApi.suspendTenant(id),
    onSuccess: () => {
      toast.success('Tenant suspended');
      qc.invalidateQueries({ queryKey: ['tenant', id] });
    },
    onError: () => toast.error('Failed to suspend tenant'),
  });

  const activateMutation = useMutation({
    mutationFn: () => adminApi.activateTenant(id),
    onSuccess: () => {
      toast.success('Tenant activated');
      qc.invalidateQueries({ queryKey: ['tenant', id] });
    },
    onError: () => toast.error('Failed to activate tenant'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteTenant(id),
    onSuccess: () => {
      toast.success('Tenant deleted');
      router.push('/dashboard/tenants');
    },
    onError: () => toast.error('Failed to delete tenant'),
  });

  const filteredUsers = tenant.users.filter(
    (u) =>
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/tenants"
          className="rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">{tenant.slug}</p>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Plan</p>
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5', planBadgeColor(tenant.plan))}>
                {tenant.plan}
              </span>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5', statusBadgeColor(tenant.status))}>
                {tenant.status}
              </span>
            </div>
            <div>
              <p className="text-muted-foreground">Data Region</p>
              <p className="font-medium text-foreground">{tenant.dataRegion}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium text-foreground">
                {format(new Date(tenant.createdAt), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p className="font-medium text-foreground">
                {format(new Date(tenant.updatedAt), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Tenant ID</p>
              <p className="font-mono text-xs text-foreground">{tenant.id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatMini label="Users" value={tenant.stats.userCount} icon={Users} />
        <StatMini label="Channels" value={tenant.stats.channelCount} icon={Hash} />
        <StatMini label="Messages" value={tenant.stats.messageCount} icon={MessageSquare} />
        <StatMini label="Storage" value={formatBytes(tenant.stats.storageBytes)} icon={HardDrive} />
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Users</h2>
          <input
            type="text"
            placeholder="Search users..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 text-xs font-medium text-muted-foreground">{u.role}</td>
                  <td className="px-5 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusBadgeColor(u.status))}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {u.lastSeen ? format(new Date(u.lastSeen), 'MMM d, yyyy') : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit logs */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Recent Audit Logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Resource</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody>
              {tenant.auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                  </td>
                  <td className="px-5 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground font-mono">
                      {log.action}
                    </code>
                  </td>
                  <td className="px-5 py-3 text-xs text-foreground">{log.userName}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{log.resource}</td>
                  <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-base font-semibold text-destructive mb-1">Danger Zone</h2>
        <p className="text-sm text-muted-foreground mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <div className="flex flex-wrap gap-3">
          {tenant.status === 'ACTIVE' ? (
            <button
              onClick={() => suspendMutation.mutate()}
              disabled={suspendMutation.isPending}
              className="flex items-center gap-2 rounded-md border border-yellow-500 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-70 transition-colors"
            >
              <Ban className="h-4 w-4" />
              {suspendMutation.isPending ? 'Suspending...' : 'Suspend Tenant'}
            </button>
          ) : (
            <button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="flex items-center gap-2 rounded-md border border-green-500 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-70 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              {activateMutation.isPending ? 'Activating...' : 'Activate Tenant'}
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Permanently delete "${tenant.name}" and ALL its data? This cannot be undone.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-70 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Need React import for useState
import React from 'react';
