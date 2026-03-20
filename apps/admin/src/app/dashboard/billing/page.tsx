'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { adminApi } from '@/lib/api';
import { cn, formatCurrency, planBadgeColor } from '@/lib/utils';

interface TenantBilling {
  tenantId: string;
  tenantName: string;
  plan: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIAL';
  mrr: number;
  nextBillingDate: string | null;
  billingEmail: string;
  userCount: number;
  overdue: boolean;
  invoiceAmount?: number;
  daysOverdue?: number;
}

interface BillingOverview {
  mrr: number;
  arr: number;
  churnRate: number;
  newMrrThisMonth: number;
  churnedMrrThisMonth: number;
  totalPaying: number;
  tenants: TenantBilling[];
}

const MOCK_OVERVIEW: BillingOverview = {
  mrr: 48_300,
  arr: 579_600,
  churnRate: 2.1,
  newMrrThisMonth: 3_400,
  churnedMrrThisMonth: 900,
  totalPaying: 97,
  tenants: Array.from({ length: 15 }, (_, i) => ({
    tenantId: `t${i + 1}`,
    tenantName: [
      'Acme Corp', 'Stark Industries', 'Wayne Enterprises', 'Initech LLC',
      'Cyberdyne Systems', 'Umbrella Corp', 'Weyland-Yutani', 'Oscorp',
      'Dunder Mifflin', 'Vandelay Industries', 'Sterling Cooper', 'Pendant Publishing',
      'Morn Corp', 'Pied Piper', 'Aviato LLC',
    ][i],
    plan: (['FREE', 'PRO', 'ENTERPRISE'] as const)[i % 3],
    status: (['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'PAST_DUE', 'ACTIVE', 'ACTIVE', 'TRIAL', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'PAST_DUE', 'ACTIVE', 'ACTIVE', 'CANCELED'] as const)[i],
    mrr: [0, 49, 199, 0, 49, 199, 199, 0, 49, 49, 199, 49, 49, 199, 0][i],
    nextBillingDate: i < 14 ? new Date(2024, 1, 1 + i * 2).toISOString() : null,
    billingEmail: `billing@company${i + 1}.com`,
    userCount: [523, 210, 88, 9, 34, 145, 302, 12, 67, 88, 210, 55, 78, 189, 0][i],
    overdue: i === 4 || i === 11,
    invoiceAmount: i === 4 ? 49 : i === 11 ? 49 : undefined,
    daysOverdue: i === 4 ? 12 : i === 11 ? 5 : undefined,
  })),
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  PAST_DUE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  CANCELED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  positive,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && (
        <p className={cn('text-xs mt-1', positive === undefined ? 'text-muted-foreground' : positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ChangePlanModal({
  tenant,
  open,
  onClose,
}: {
  tenant: TenantBilling | null;
  open: boolean;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState(tenant?.plan || 'PRO');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminApi.updateTenantPlan(tenant!.tenantId, plan),
    onSuccess: () => {
      toast.success('Plan updated successfully');
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
      onClose();
    },
    onError: () => toast.error('Failed to update plan'),
  });

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-foreground mb-1">
            Change Subscription Plan
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Update plan for <strong className="text-foreground">{tenant?.tenantName}</strong>
          </Dialog.Description>

          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="FREE">Free — $0/mo</option>
            <option value="PRO">Pro — $49/mo</option>
            <option value="ENTERPRISE">Enterprise — $199/mo</option>
          </select>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70 transition-colors"
            >
              {mutation.isPending ? 'Saving...' : 'Update Plan'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [planModalTenant, setPlanModalTenant] = useState<TenantBilling | null>(null);

  const { data } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => adminApi.getBillingOverview().then((r) => r.data),
    retry: false,
  });

  const overview: BillingOverview = data || MOCK_OVERVIEW;
  const overdueTenants = overview.tenants.filter((t) => t.overdue);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Revenue metrics and subscription management
        </p>
      </div>

      {/* Revenue metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(overview.mrr)}
          sub={`+${formatCurrency(overview.newMrrThisMonth)} new this month`}
          icon={DollarSign}
          positive
        />
        <MetricCard
          title="Annual Run Rate"
          value={formatCurrency(overview.arr)}
          sub={`${overview.totalPaying} paying tenants`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Churn Rate"
          value={`${overview.churnRate}%`}
          sub={`-${formatCurrency(overview.churnedMrrThisMonth)} churned MRR`}
          icon={TrendingDown}
          positive={false}
        />
        <MetricCard
          title="Overdue Invoices"
          value={String(overdueTenants.length)}
          sub={overdueTenants.length > 0 ? 'Requires attention' : 'All accounts current'}
          icon={AlertCircle}
          positive={overdueTenants.length === 0}
        />
      </div>

      {/* Overdue invoices */}
      {overdueTenants.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="text-base font-semibold text-destructive mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Overdue Invoices
          </h2>
          <div className="space-y-3">
            {overdueTenants.map((t) => (
              <div
                key={t.tenantId}
                className="flex items-center justify-between rounded-lg border border-destructive/20 bg-card px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foreground">{t.tenantName}</p>
                  <p className="text-xs text-muted-foreground">{t.billingEmail}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-destructive">{formatCurrency(t.invoiceAmount || 0)}</p>
                  <p className="text-xs text-muted-foreground">{t.daysOverdue} days overdue</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant subscriptions table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Tenant Subscriptions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Plan</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">MRR</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Users</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Next Billing</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overview.tenants.map((t) => (
                <tr
                  key={t.tenantId}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/20 transition-colors',
                    t.overdue && 'bg-destructive/5'
                  )}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{t.tenantName}</p>
                    <p className="text-xs text-muted-foreground">{t.billingEmail}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        planBadgeColor(t.plan)
                      )}
                    >
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_COLORS[t.status]
                      )}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">
                    {t.mrr > 0 ? formatCurrency(t.mrr) : '—'}
                  </td>
                  <td className="px-5 py-3 text-foreground">{t.userCount}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {t.nextBillingDate
                      ? format(new Date(t.nextBillingDate), 'MMM d, yyyy')
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setPlanModalTenant(t)}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Change Plan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ChangePlanModal
        tenant={planModalTenant}
        open={!!planModalTenant}
        onClose={() => setPlanModalTenant(null)}
      />
    </div>
  );
}
