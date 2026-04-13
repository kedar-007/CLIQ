'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Bell,
  ChevronRight,
  MoreHorizontal,
  Search,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresenceAvatarProps {
  name: string;
  src?: string | null;
  status?: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DND';
  size?: 'sm' | 'md' | 'lg';
}

const presenceMap = {
  ONLINE: 'bg-emerald-500',
  AWAY: 'bg-amber-400',
  OFFLINE: 'bg-slate-400',
  DND: 'bg-rose-500',
} as const;

const avatarSizeMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const;

export function PresenceAvatar({
  name,
  src,
  status = 'ONLINE',
  size = 'md',
}: PresenceAvatarProps) {
  const initials = name
    .split(' ')
    .map((chunk) => chunk[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative shrink-0">
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn('rounded-full object-cover ring-2 ring-white dark:ring-slate-900', avatarSizeMap[size])}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] font-semibold text-white ring-2 ring-white dark:ring-slate-900',
            avatarSizeMap[size]
          )}
        >
          {initials}
        </div>
      )}
      <span
        className={cn(
          'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white transition-colors duration-200 dark:border-slate-950',
          presenceMap[status]
        )}
      />
    </div>
  );
}

export function ContextSearch({
  placeholder,
  rightLabel,
  value,
  onChange,
}: {
  placeholder: string;
  rightLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="dsv-input w-full pl-10 pr-16"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {rightLabel ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
          {rightLabel}
        </span>
      ) : null}
    </div>
  );
}

export function FloatingHeader({
  title,
  subtitle,
  actions,
  participants,
  aside,
  sticky = true,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  participants?: Array<{ id: string; name: string; avatarUrl?: string | null; status?: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DND' }>;
  aside?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-4', sticky ? 'dsv-floating-header' : 'rounded-[26px] border border-border/70 bg-card px-5 py-5 shadow-[0_12px_28px_rgba(17,24,39,0.06)]')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="truncate text-[28px] font-semibold leading-tight text-foreground">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {participants && participants.length > 0 ? (
            <div className="hidden items-center gap-2 md:flex">
              <AvatarStack people={participants} />
              <span className="text-xs font-medium text-muted-foreground">
                {participants.length} active now
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      {aside}
    </div>
  );
}

export function AvatarStack({
  people,
  max = 4,
}: {
  people: Array<{ id: string; name: string; avatarUrl?: string | null; status?: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DND' }>;
  max?: number;
}) {
  const visible = people.slice(0, max);
  const remaining = Math.max(people.length - max, 0);

  return (
    <div className="flex items-center">
      {visible.map((person, index) => (
        <div key={person.id} className={cn(index > 0 && '-ml-3')}>
          <PresenceAvatar
            name={person.name}
            src={person.avatarUrl}
            status={person.status}
            size="sm"
          />
        </div>
      ))}
      {remaining > 0 ? (
        <div className="-ml-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[11px] font-semibold text-white dark:border-slate-950">
          +{remaining}
        </div>
      ) : null}
    </div>
  );
}

export function ScreenSection({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          ) : null}
          <h2 className="text-[22px] font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  accent = 'blue',
}: {
  label: string;
  value: string;
  delta?: string;
  accent?: 'blue' | 'green' | 'violet' | 'amber';
}) {
  const toneMap = {
    blue: {
      bar: 'from-[#1A56DB]/16 to-[#1A56DB]/4',
      chip: 'bg-[#1A56DB]/10 text-[#1A56DB]',
    },
    green: {
      bar: 'from-[#0E9F6E]/16 to-[#0E9F6E]/4',
      chip: 'bg-[#0E9F6E]/10 text-[#0E9F6E]',
    },
    violet: {
      bar: 'from-[#7C3AED]/16 to-[#7C3AED]/4',
      chip: 'bg-[#7C3AED]/10 text-[#7C3AED]',
    },
    amber: {
      bar: 'from-[#F59E0B]/16 to-[#F59E0B]/4',
      chip: 'bg-[#F59E0B]/10 text-[#B45309]',
    },
  } as const;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="dsv-card dsv-card-hover overflow-hidden"
    >
      <div className={cn('h-1 bg-gradient-to-r', toneMap[accent].bar)} />
      <div className="p-5">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="text-[30px] font-semibold tracking-tight text-foreground">{value}</p>
          {delta ? (
            <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-medium', toneMap[accent].chip)}>
              {delta}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export function TimelineItem({
  title,
  description,
  time,
  person,
}: {
  title: string;
  description: string;
  time: string;
  person: { name: string; avatarUrl?: string | null; status?: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DND' };
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-primary/20 hover:bg-card">
      <PresenceAvatar name={person.name} src={person.avatarUrl} status={person.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ContextListItem({
  title,
  subtitle,
  meta,
  unread,
  active,
  avatar,
  href,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  unread?: number;
  active?: boolean;
  avatar?: React.ReactNode;
  href?: string;
}) {
  const item = (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border px-3 py-3 transition-all duration-150',
        active
          ? 'border-primary/20 bg-primary/8 shadow-[0_12px_24px_rgba(26,86,219,0.08)]'
          : 'border-transparent bg-transparent hover:border-border hover:bg-white/70 dark:hover:bg-slate-900/70'
      )}
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {unread ? (
            <span className="badge-pulse rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-1">
        {meta ? <span className="text-[11px] text-muted-foreground">{meta}</span> : null}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </motion.div>
  );

  if (href) {
    return <Link href={href}>{item}</Link>;
  }

  return item;
}

export function PinnedStrip({
  items,
}: {
  items: Array<{ id: string; title: string; tag: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-white/85 px-3 py-2 text-sm font-medium text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary dark:bg-slate-950/70"
        >
          <Star className="h-3.5 w-3.5 text-[#F59E0B]" />
          <span>{item.title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.tag}</span>
        </button>
      ))}
    </div>
  );
}

export function QuickActionBar({
  actions,
}: {
  actions: Array<{ id: string; label: string; icon: React.ReactNode; tone?: 'blue' | 'green' | 'violet' }>;
}) {
  const toneMap = {
    blue: 'bg-[#1A56DB] text-white hover:bg-[#1747B8]',
    green: 'bg-[#0E9F6E] text-white hover:bg-[#0B855E]',
    violet: 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]',
  } as const;

  return (
    <div className="inline-flex rounded-full border border-border bg-white/90 p-1.5 shadow-[0_16px_36px_rgba(17,24,39,0.10)] backdrop-blur dark:bg-slate-950/75">
      {actions.map((action) => (
        <button
          key={action.id}
          className={cn(
            'mx-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150',
            toneMap[action.tone || 'blue']
          )}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function MiniCalendarCard() {
  const today = new Date();
  const events = [
    { id: '1', time: '09:30', title: 'Leadership sync', note: 'Boardroom A' },
    { id: '2', time: '13:00', title: 'Client rollout review', note: 'Zoom · Product team' },
    { id: '3', time: '17:30', title: 'Weekly close-out', note: 'Ops channel' },
  ];

  return (
    <div className="dsv-card overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Today</p>
          <h3 className="mt-1 text-lg font-semibold">{format(today, 'EEEE, d MMMM')}</h3>
        </div>
        <button className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-border/70 bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{event.title}</p>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-muted-foreground dark:bg-slate-900">
                {event.time}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyWorkspaceState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dsv-card flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,rgba(26,86,219,0.14),rgba(124,58,237,0.14))]">
        <MoreHorizontal className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
