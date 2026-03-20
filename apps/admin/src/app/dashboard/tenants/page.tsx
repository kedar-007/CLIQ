'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  MoreHorizontal,
  Eye,
  Ban,
  CheckCircle,
  CreditCard,
  Trash2,
  Filter,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { toast } from 'sonner';
import Link from 'next/link';
import { DataTable } from '@/components/ui/data-table';
import { CreateTenantDialog } from '@/components/tenant/create-tenant-dialog';
import { adminApi } from '@/lib/api';
import { cn, planBadgeColor, statusBadgeColor } from '@/lib/utils';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  userCount: number;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

const MOCK_TENANTS: Tenant[] = Array.from({ length: 22 }, (_, i) => ({
  id: `t${i + 1}`,
  name: [
    'Acme Corp', 'Stark Industries', 'Wayne Enterprises', 'Initech LLC',
    'Cyberdyne Systems', 'Umbrella Corp', 'Weyland-Yutani', 'Oscorp',
    'Dunder Mifflin', 'Vandelay Industries', 'Sterling Cooper', 'Pendant Publishing',
    'Morn Corp', 'Pied Piper', 'Aviato LLC', 'Hooli', 'Raviga Capital',
    'Bluth Company', 'Globodyne', 'Wolfram & Hart', 'Planet Express', 'Soylent Corp',
  ][i],
  slug: ['acme','stark','wayne','initech','cyberdyne','umbrella','weyland','oscorp','dunder','vandelay','sterling','pendant','morn','piedpiper','aviato','hooli','raviga','bluth','globo','wolfram','planet','soylent'][i],
  plan: (['FREE', 'PRO', 'ENTERPRISE'] as const)[i % 3],
  userCount: Math.floor(10 + Math.random() * 1200),
  status: i === 3 || i === 15 ? 'SUSPENDED' : 'ACTIVE',
  createdAt: new Date(2024, 0, i * 8 + 1).toISOString(),
}));

function ChangePlanDialog({
  tenant,
  open,
  onClose,
}: {
  tenant: Tenant | null;
  open: boolean;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState(tenant?.plan || 'FREE');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminApi.updateTenant(tenant!.id, { plan }),
    onSuccess: () => {
      toast.success('Plan updated successfully');
      qc.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
    onError: () => toast.error('Failed to update plan'),
  });

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-foreground mb-1">
            Change Plan
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Update subscription plan for{' '}
            <strong className="text-foreground">{tenant?.name}</strong>
          </Dialog.Description>

          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Tenant['plan'])}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70 transition-colors"
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function TenantsPage() {
  const qc = useQueryClient();
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planDialogTenant, setPlanDialogTenant] = useState<Tenant | null>(null);

  const { data } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => adminApi.getTenants().then((r) => r.data),
    retry: false,
  });

  const tenants: Tenant[] = data?.tenants || MOCK_TENANTS;

  const filtered = tenants.filter((t) => {
    if (planFilter !== 'ALL' && t.plan !== planFilter) return false;
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    return true;
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => adminApi.suspendTenant(id),
    onSuccess: () => {
      toast.success('Tenant suspended');
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: () => toast.error('Failed to suspend tenant'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => adminApi.activateTenant(id),
    onSuccess: () => {
      toast.success('Tenant activated');
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: () => toast.error('Failed to activate tenant'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTenant(id),
    onSuccess: () => {
      toast.success('Tenant deleted');
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: () => toast.error('Failed to delete tenant'),
  });

  const columns: ColumnDef<Tenant>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: 'plan',
      header: 'Plan',
      cell: ({ row }) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            planBadgeColor(row.original.plan)
          )}
        >
          {row.original.plan}
        </span>
      ),
    },
    {
      accessorKey: 'userCount',
      header: 'Users',
      cell: ({ row }) => (
        <span className="text-foreground">{row.original.userCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            statusBadgeColor(row.original.status)
          )}
        >
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {format(new Date(row.original.createdAt), 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const t = row.original;
        return (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="rounded-md p-1.5 hover:bg-muted transition-colors text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[170px] rounded-lg border border-border bg-popover p-1 shadow-lg text-sm"
              >
                <DropdownMenu.Item asChild>
                  <Link
                    href={`/dashboard/tenants/${t.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-foreground outline-none hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => setPlanDialogTenant(t)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-foreground outline-none hover:bg-muted"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Change Plan
                </DropdownMenu.Item>
                {t.status === 'ACTIVE' ? (
                  <DropdownMenu.Item
                    onSelect={() => suspendMutation.mutate(t.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-yellow-600 dark:text-yellow-400 outline-none hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  >
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    onSelect={() => activateMutation.mutate(t.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-green-600 dark:text-green-400 outline-none hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Activate
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <DropdownMenu.Item
                  onSelect={() => {
                    if (confirm(`Are you sure you want to delete "${t.name}"? This cannot be undone.`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-destructive outline-none hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tenants.length} workspaces registered
          </p>
        </div>
        <CreateTenantDialog onCreated={() => qc.invalidateQueries({ queryKey: ['tenants'] })} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Plan:</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Plans</option>
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        {(planFilter !== 'ALL' || statusFilter !== 'ALL') && (
          <button
            onClick={() => { setPlanFilter('ALL'); setStatusFilter('ALL'); }}
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
          searchPlaceholder="Search tenants..."
          pageSize={10}
        />
      </div>

      <ChangePlanDialog
        tenant={planDialogTenant}
        open={!!planDialogTenant}
        onClose={() => setPlanDialogTenant(null)}
      />
    </div>
  );
}
