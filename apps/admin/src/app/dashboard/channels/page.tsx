'use client';

import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Hash, Lock } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

interface Channel {
  id: string;
  name: string;
  type: string;
  tenantName: string;
  memberCount: number;
  messageCount: number;
  isArchived: boolean;
  createdAt: string;
}

const MOCK_CHANNELS: Channel[] = Array.from({ length: 25 }, (_, i) => ({
  id: `c${i + 1}`,
  name: ['general', 'dev', 'design', 'marketing', 'random', 'support', 'announcements', 'hr', 'sales', 'ops', 'backend', 'frontend', 'infra', 'product', 'qa', 'data', 'legal', 'finance', 'culture', 'watercooler', 'help', 'bugs', 'releases', 'roadmap', 'ideas'][i],
  type: ['PUBLIC', 'PRIVATE', 'PUBLIC', 'PUBLIC', 'PUBLIC', 'PUBLIC', 'ANNOUNCEMENT', 'PRIVATE', 'PRIVATE', 'PUBLIC', 'PRIVATE', 'PRIVATE', 'PRIVATE', 'PUBLIC', 'PRIVATE', 'PRIVATE', 'PRIVATE', 'PRIVATE', 'PUBLIC', 'PUBLIC', 'PUBLIC', 'PRIVATE', 'PUBLIC', 'PUBLIC', 'PUBLIC'][i],
  tenantName: ['Acme Corp', 'Stark Industries', 'Wayne Enterprises', 'Initech LLC', 'Cyberdyne Systems'][i % 5],
  memberCount: Math.floor(5 + Math.random() * 200),
  messageCount: Math.floor(100 + Math.random() * 50000),
  isArchived: i === 6 || i === 13,
  createdAt: new Date(2023, i % 12, (i % 28) + 1).toISOString(),
}));

export default function ChannelsPage() {
  const columns: ColumnDef<Channel>[] = [
    {
      accessorKey: 'name',
      header: 'Channel',
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-2">
            {c.type === 'PRIVATE' ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{c.name}</span>
            {c.isArchived && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                archived
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.type}</span>
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
      accessorKey: 'memberCount',
      header: 'Members',
      cell: ({ row }) => (
        <span className="text-foreground">{row.original.memberCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: 'messageCount',
      header: 'Messages',
      cell: ({ row }) => (
        <span className="text-foreground">{row.original.messageCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.createdAt), 'MMM d, yyyy')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Channels</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {MOCK_CHANNELS.length} channels across all tenants
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <DataTable
          columns={columns}
          data={MOCK_CHANNELS}
          searchPlaceholder="Search channels..."
          pageSize={10}
        />
      </div>
    </div>
  );
}
