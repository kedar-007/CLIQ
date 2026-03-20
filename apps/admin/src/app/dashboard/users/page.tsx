'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { MoreHorizontal, Eye, KeyRound, Ban, Trash2, Filter } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Avatar from '@radix-ui/react-avatar';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import { adminApi } from '@/lib/api';
import { cn, statusBadgeColor } from '@/lib/utils';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  tenantName: string;
  tenantId: string;
  role: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
}

const ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST'];
const STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'];

const MOCK_USERS: AdminUser[] = Array.from({ length: 30 }, (_, i) => ({
  id: `u${i + 1}`,
  name: [
    'Alice Johnson', 'Bob Smith', 'Carol White', 'Dave Brown', 'Eve Davis',
    'Frank Miller', 'Grace Wilson', 'Henry Moore', 'Iris Clark', 'Jack Lee',
    'Karen Hall', 'Leo Allen', 'Mia Young', 'Noah King', 'Olivia Wright',
    'Paul Scott', 'Quinn Adams', 'Rachel Baker', 'Sam Nelson', 'Tina Carter',
    'Uma Rivera', 'Victor Mitchell', 'Wendy Perez', 'Xander Roberts', 'Yara Turner',
    'Zach Phillips', 'Amy Evans', 'Ben Edwards', 'Clara Collins', 'Dan Stewart',
  ][i],
  email: `user${i + 1}@example.com`,
  avatarUrl: undefined,
  tenantName: ['Acme Corp', 'Stark Industries', 'Wayne Enterprises', 'Initech LLC', 'Cyberdyne Systems'][i % 5],
  tenantId: `t${(i % 5) + 1}`,
  role: ROLES[i % ROLES.length],
  status: i === 3 || i === 17 ? 'SUSPENDED' : 'ACTIVE',
  lastLogin: i < 25 ? new Date(2024, 0, 20 - (i % 7)).toISOString() : null,
  createdAt: new Date(2023, i % 12, (i % 28) + 1).toISOString(),
}));

export default function UsersPage() {
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.getUsers().then((r) => r.data),
    retry: false,
  });

  const users: AdminUser[] = data?.users || MOCK_USERS;

  const filtered = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    return true;
  });

  const resetPwdMutation = useMutation({
    mutationFn: (id: string) => adminApi.resetUserPassword(id),
    onSuccess: () => toast.success('Password reset email sent'),
    onError: () => toast.error('Failed to reset password'),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => adminApi.suspendUser(id),
    onSuccess: () => {
      toast.success('User suspended');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error('Failed to suspend user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      toast.success('User deleted');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error('Failed to delete user'),
  });

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar.Root className="h-8 w-8 overflow-hidden rounded-full shrink-0">
              <Avatar.Image src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
              <Avatar.Fallback className="flex h-full w-full items-center justify-center bg-primary/20 text-primary text-xs font-semibold">
                {u.name.charAt(0)}
              </Avatar.Fallback>
            </Avatar.Root>
            <div>
              <p className="font-medium text-foreground">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'tenantName',
      header: 'Tenant',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.tenantName}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {row.original.role}
        </span>
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
      accessorKey: 'lastLogin',
      header: 'Last Login',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.lastLogin
            ? format(new Date(row.original.lastLogin), 'MMM d, yyyy')
            : 'Never'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const u = row.original;
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
                className="z-50 min-w-[175px] rounded-lg border border-border bg-popover p-1 shadow-lg text-sm"
              >
                <DropdownMenu.Item
                  onSelect={() => resetPwdMutation.mutate(u.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-foreground outline-none hover:bg-muted"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Reset Password
                </DropdownMenu.Item>
                {u.status !== 'SUSPENDED' && (
                  <DropdownMenu.Item
                    onSelect={() => suspendMutation.mutate(u.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-yellow-600 dark:text-yellow-400 outline-none hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  >
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <DropdownMenu.Item
                  onSelect={() => {
                    if (confirm(`Permanently delete user "${u.name}"?`)) {
                      deleteMutation.mutate(u.id);
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {users.length} users across all tenants
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
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
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {(roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
          <button
            onClick={() => { setRoleFilter('ALL'); setStatusFilter('ALL'); }}
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
          searchPlaceholder="Search by name or email..."
          pageSize={10}
        />
      </div>
    </div>
  );
}
