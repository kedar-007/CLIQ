'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { LineChart } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { AreaChart } from '@/components/charts/area-chart';
import { PieChart } from '@/components/charts/pie-chart';
import { adminApi } from '@/lib/api';

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

// ─── Mock data generators ─────────────────────────────────────────────────────

function genDauMau(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return {
      date: format(d, days > 30 ? 'MMM d' : 'MMM d'),
      DAU: Math.floor(1200 + Math.sin(i / 5) * 300 + i * 15),
      MAU: Math.floor(8000 + i * 40),
    };
  });
}

function genMessages(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return {
      date: format(d, 'MMM d'),
      Messages: Math.floor(4000 + Math.random() * 3000),
    };
  });
}

function genTopChannels() {
  return [
    { channel: '#general', messages: 12400 },
    { channel: '#dev', messages: 9100 },
    { channel: '#design', messages: 6800 },
    { channel: '#marketing', messages: 4300 },
    { channel: '#random', messages: 3900 },
    { channel: '#support', messages: 2700 },
  ];
}

function genUserGrowth(days: number) {
  let total = 14000;
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    total += Math.floor(20 + Math.random() * 60);
    return {
      date: format(d, 'MMM d'),
      'Total Users': total,
    };
  });
}

const FEATURE_USAGE = [
  { name: 'Messages', value: 68000, color: 'hsl(239,84%,67%)' },
  { name: 'Video Calls', value: 12400, color: 'hsl(142,70%,45%)' },
  { name: 'File Shares', value: 8900, color: 'hsl(32,95%,60%)' },
  { name: 'Voice Calls', value: 5200, color: 'hsl(280,70%,55%)' },
  { name: 'Screen Share', value: 3100, color: 'hsl(0,70%,55%)' },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);

  const { data: dauMauData } = useQuery({
    queryKey: ['dau-mau', range],
    queryFn: () => adminApi.getDauMau(range).then((r) => r.data),
    retry: false,
  });

  const { data: messagesData } = useQuery({
    queryKey: ['messages-chart', range],
    queryFn: () => adminApi.getMessagesTimeSeries(range).then((r) => r.data),
    retry: false,
  });

  const { data: topChannelsData } = useQuery({
    queryKey: ['top-channels', range],
    queryFn: () => adminApi.getTopChannels(range).then((r) => r.data),
    retry: false,
  });

  const { data: userGrowthData } = useQuery({
    queryKey: ['user-growth', range],
    queryFn: () => adminApi.getUserGrowth(range).then((r) => r.data),
    retry: false,
  });

  const { data: featureUsageData } = useQuery({
    queryKey: ['feature-usage'],
    queryFn: () => adminApi.getFeatureUsage().then((r) => r.data),
    retry: false,
  });

  const dauMau = dauMauData?.data || genDauMau(range);
  const messages = messagesData?.data || genMessages(range);
  const topChannels = topChannelsData?.channels || genTopChannels();
  const userGrowth = userGrowthData?.data || genUserGrowth(range);
  const featureUsage = featureUsageData?.features || FEATURE_USAGE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform usage and growth metrics
          </p>
        </div>
        {/* Date range picker */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                range === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* DAU/MAU line chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Daily & Monthly Active Users
        </h2>
        <LineChart
          data={dauMau}
          lines={[
            { key: 'DAU', color: 'hsl(239,84%,67%)', name: 'Daily Active' },
            { key: 'MAU', color: 'hsl(142,70%,45%)', name: 'Monthly Active' },
          ]}
          xAxisKey="date"
          height={300}
        />
      </div>

      {/* Messages bar chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Messages per Day
        </h2>
        <BarChart
          data={messages}
          bars={[{ key: 'Messages', color: 'hsl(239,84%,67%)' }]}
          xAxisKey="date"
          height={280}
        />
      </div>

      {/* Two-column: top channels + feature usage pie */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Top Channels by Messages
          </h2>
          <BarChart
            data={topChannels}
            bars={[{ key: 'messages', color: 'hsl(239,84%,67%)' }]}
            xAxisKey="channel"
            height={280}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Feature Usage Distribution
          </h2>
          <PieChart
            data={featureUsage}
            height={280}
            innerRadius={70}
          />
        </div>
      </div>

      {/* User growth area chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          User Growth
        </h2>
        <AreaChart
          data={userGrowth}
          areas={[{ key: 'Total Users', color: 'hsl(239,84%,67%)' }]}
          xAxisKey="date"
          height={280}
        />
      </div>
    </div>
  );
}
