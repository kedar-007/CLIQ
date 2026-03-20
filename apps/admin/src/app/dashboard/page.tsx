'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Users,
  MessageSquare,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { StatCard } from '@/components/ui/stat-card';
import { LineChart } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { adminApi } from '@/lib/api';
import { cn, planBadgeColor, statusBadgeColor, formatNumber } from '@/lib/utils';

// ─── Mock data generators (used as fallback when API is unavailable) ─────────

function generateDauData(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return {
      date: format(d, 'MMM d'),
      DAU: Math.floor(1200 + Math.random() * 800 + i * 20),
    };
  });
}

function generateMessageData(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return {
      date: format(d, 'MMM d'),
      Messages: Math.floor(4000 + Math.random() * 3000),
    };
  });
}

const MOCK_STATS = {
  totalTenants: 142,
  totalTenantChange: 8.3,
  totalUsers: 18_402,
  totalUserChange: 12.1,
  messagesToday: 94_381,
  messagesTodayChange: -2.4,
  activeCalls: 37,
  activeCallsChange: 15.6,
};

const MOCK_RECENT_TENANTS = [
  { id: '1', name: 'Acme Corp', slug: 'acme', plan: 'ENTERPRISE', userCount: 523, status: 'ACTIVE', createdAt: subDays(new Date(), 2) },
  { id: '2', name: 'Stark Industries', slug: 'stark', plan: 'PRO', userCount: 210, status: 'ACTIVE', createdAt: subDays(new Date(), 5) },
  { id: '3', name: 'Wayne Enterprises', slug: 'wayne', plan: 'PRO', userCount: 88, status: 'ACTIVE', createdAt: subDays(new Date(), 8) },
  { id: '4', name: 'Initech LLC', slug: 'initech', plan: 'FREE', userCount: 9, status: 'SUSPENDED', createdAt: subDays(new Date(), 11) },
  { id: '5', name: 'Cyberdyne Systems', slug: 'cyberdyne', plan: 'ENTERPRISE', userCount: 1200, status: 'ACTIVE', createdAt: subDays(new Date(), 14) },
];

const MOCK_HEALTH = [
  { name: 'PostgreSQL', status: 'UP', latency: '2ms' },
  { name: 'Redis', status: 'UP', latency: '0.4ms' },
  { name: 'Elasticsearch', status: 'UP', latency: '8ms' },
  { name: 'Kafka', status: 'UP', latency: '5ms' },
];

function HealthDot({ status }: { status: 'UP' | 'DOWN' }) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        status === 'UP' ? 'bg-green-500' : 'bg-red-500'
      )}
    />
  );
}

export default function DashboardPage() {
  const { data: statsData } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => adminApi.getDashboardStats().then((r) => r.data),
    retry: false,
  });

  const { data: healthData } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => adminApi.getSystemHealth().then((r) => r.data),
    retry: false,
    refetchInterval: 30_000,
  });

  const { data: dauData } = useQuery({
    queryKey: ['dau-30'],
    queryFn: () => adminApi.getDauTimeSeries(30).then((r) => r.data),
    retry: false,
  });

  const { data: msgData } = useQuery({
    queryKey: ['messages-7'],
    queryFn: () => adminApi.getMessagesTimeSeries(7).then((r) => r.data),
    retry: false,
  });

  const { data: tenantsData } = useQuery({
    queryKey: ['recent-tenants'],
    queryFn: () => adminApi.getRecentTenants().then((r) => r.data),
    retry: false,
  });

  const stats = statsData || MOCK_STATS;
  const health: typeof MOCK_HEALTH = healthData?.services || MOCK_HEALTH;
  const dauChart = dauData?.data || generateDauData(30);
  const msgChart = msgData?.data || generateMessageData(7);
  const recentTenants = tenantsData?.tenants || MOCK_RECENT_TENANTS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform-wide overview and system health
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Tenants"
          value={formatNumber(stats.totalTenants)}
          change={stats.totalTenantChange}
          changeLabel="vs last month"
          icon={Building2}
        />
        <StatCard
          title="Total Users"
          value={formatNumber(stats.totalUsers)}
          change={stats.totalUserChange}
          changeLabel="vs last month"
          icon={Users}
        />
        <StatCard
          title="Messages Today"
          value={formatNumber(stats.messagesToday)}
          change={stats.messagesTodayChange}
          changeLabel="vs yesterday"
          icon={MessageSquare}
        />
        <StatCard
          title="Active Calls"
          value={stats.activeCalls}
          change={stats.activeCallsChange}
          changeLabel="vs yesterday"
          icon={Phone}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Daily Active Users — Last 30 Days
          </h2>
          <LineChart
            data={dauChart}
            lines={[{ key: 'DAU', color: 'hsl(239,84%,67%)' }]}
            xAxisKey="date"
            height={260}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Messages per Day — Last 7 Days
          </h2>
          <BarChart
            data={msgChart}
            bars={[{ key: 'Messages', color: 'hsl(239,84%,67%)' }]}
            xAxisKey="date"
            height={260}
          />
        </div>
      </div>

      {/* Recent tenants + system health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent tenants table */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Recent Tenants</h2>
            <a
              href="/dashboard/tenants"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Plan</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Users</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentTenants.map(
                  (t: {
                    id: string;
                    name: string;
                    slug: string;
                    plan: string;
                    userCount: number;
                    status: string;
                    createdAt: Date | string;
                  }) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.slug}</p>
                        </div>
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
                      <td className="px-5 py-3 text-foreground">{t.userCount}</td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            statusBadgeColor(t.status)
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {format(new Date(t.createdAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System health */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">System Health</h2>
          </div>
          <div className="divide-y divide-border">
            {health.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <HealthDot status={service.status as 'UP' | 'DOWN'} />
                  <span className="text-sm font-medium text-foreground">{service.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {service.latency && (
                    <span className="text-xs text-muted-foreground">{service.latency}</span>
                  )}
                  {service.status === 'UP' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
