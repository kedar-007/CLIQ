'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { format, subDays } from 'date-fns';
import { Download, Filter, X, ExternalLink } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { DataTable } from '@/components/ui/data-table';
import { adminApi } from '@/lib/api';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  tenantId: string;
  tenantName: string;
  action: string;
  resource: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown>;
}

const ACTION_TYPES = [
  'ALL',
  'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_SUSPENDED',
  'CHANNEL_CREATED', 'CHANNEL_ARCHIVED', 'CHANNEL_DELETED',
  'MESSAGE_DELETED', 'ROLE_CHANGED', 'PLAN_CHANGED',
  'SETTINGS_UPDATED', 'LOGIN', 'LOGOUT', 'PASSWORD_RESET',
];

function generateMockLogs(): AuditLog[] {
  return Array.from({ length: 50 }, (_, i) => ({
    id: `log${i + 1}`,
    timestamp: subDays(new Date(), Math.floor(i / 5)).toISOString(),
    userId: `u${(i % 5) + 1}`,
    userName: ['Alice Johnson', 'Bob Smith', 'Carol White', 'Dave Brown', 'Eve Davis'][i % 5],
    userEmail: ['alice', 'bob', 'carol', 'dave', 'eve'][i % 5] + '@example.com',
    tenantId: `t${(i % 4) + 1}`,
    tenantName: ['Acme Corp', 'Stark Industries', 'Wayne Enterprises', 'Initech LLC'][i % 4],
    action: ACTION_TYPES.slice(1)[i % (ACTION_TYPES.length - 1)],
    resource: ['User', 'Channel', 'Message', 'Settings', 'Billing'][i % 5],
    resourceId: `res${i + 1}`,
    ipAddress: `192.168.${Math.floor(i / 10)}.${(i % 254) + 1}`,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    details: {
      before: { status: 'ACTIVE' },
      after: { status: 'SUSPENDED' },
      reason: 'Policy violation',
    },
  }));
}

function LogDetailDialog({ log, open, onClose }: { log: AuditLog | null; open: boolean; onClose: () => void }) {
  if (!log) return null;
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Audit Log Details
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3 text-sm">
            {[
              ['ID', log.id],
              ['Timestamp', format(new Date(log.timestamp), 'PPpp')],
              ['Action', log.action],
              ['Resource', `${log.resource} (${log.resourceId})`],
              ['User', `${log.userName} <${log.userEmail}>`],
              ['Tenant', log.tenantName],
              ['IP Address', log.ipAddress],
              ['User Agent', log.userAgent],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                <span className="text-foreground break-all">{value}</span>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <p className="text-muted-foreground mb-2">Details</p>
              <pre className="rounded-md bg-muted p-3 text-xs text-foreground overflow-auto font-mono">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function exportToCSV(logs: AuditLog[]) {
  const headers = ['ID', 'Timestamp', 'User', 'Email', 'Tenant', 'Action', 'Resource', 'IP'];
  const rows = logs.map((l) => [
    l.id,
    l.timestamp,
    l.userName,
    l.userEmail,
    l.tenantName,
    l.action,
    l.resource,
    l.ipAddress,
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('ALL');
  const [tenantFilter, setTenantFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState(30);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data } = useQuery({
    queryKey: ['audit-logs', actionFilter, tenantFilter, dateRange],
    queryFn: () =>
      adminApi.getAuditLogs({
        action: actionFilter !== 'ALL' ? actionFilter : '',
        days: String(dateRange),
      }).then((r) => r.data),
    retry: false,
  });

  const logs: AuditLog[] = data?.logs || generateMockLogs();

  const filtered = logs.filter((l) => {
    if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
    if (tenantFilter !== 'ALL' && l.tenantName !== tenantFilter) return false;
    return true;
  });

  const uniqueTenants = Array.from(new Set(logs.map((l) => l.tenantName)));

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(row.original.timestamp), 'MMM d, HH:mm:ss')}
        </span>
      ),
    },
    {
      accessorKey: 'userName',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-foreground">{row.original.userName}</p>
          <p className="text-xs text-muted-foreground">{row.original.userEmail}</p>
        </div>
      ),
    },
    {
      accessorKey: 'tenantName',
      header: 'Tenant',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.tenantName}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
          {row.original.action}
        </code>
      ),
    },
    {
      accessorKey: 'resource',
      header: 'Resource',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.resource}</span>
      ),
    },
    {
      accessorKey: 'ipAddress',
      header: 'IP',
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">{row.original.ipAddress}</span>
      ),
    },
    {
      id: 'details',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => setSelectedLog(row.original)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete audit trail of all admin and user actions
          </p>
        </div>
        <button
          onClick={() => exportToCSV(filtered)}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>{a === 'ALL' ? 'All Actions' : a}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Tenant:</label>
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Tenants</option>
            {uniqueTenants.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Range:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        {(actionFilter !== 'ALL' || tenantFilter !== 'ALL') && (
          <button
            onClick={() => { setActionFilter('ALL'); setTenantFilter('ALL'); }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Search logs..."
          pageSize={15}
        />
      </div>

      <LogDetailDialog
        log={selectedLog}
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
