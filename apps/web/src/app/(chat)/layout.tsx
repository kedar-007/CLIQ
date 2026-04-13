'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bell,
  Building2,
  FolderKanban,
  Home,
  LogOut,
  MessagesSquare,
  Menu,
  Moon,
  Phone,
  Search,
  Settings,
  Shield,
  Sparkles,
  SunMedium,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallOverlay } from '@/components/chat/call-overlay';
import { IncomingCallAlert } from '@/components/chat/incoming-call-alert';
import { NotificationPanel } from '@/components/chat/notification-panel';
import { useNotifications } from '@/hooks/use-notifications';
import { useAuthStore } from '@/store/auth.store';
import type { CallJoinConfig } from '@comms/types';

const primaryNav = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/chat', icon: MessagesSquare, label: 'Messages' },
  { href: '/channels', icon: Building2, label: 'Channels' },
  { href: '/calls', icon: Phone, label: 'Calls' },
  { href: '/files', icon: FolderKanban, label: 'Files' },
  { href: '/notifications', icon: Bell, label: 'Notifications' },
];

const utilityNav = [
  { href: '/admin', icon: Shield, label: 'Admin' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const bootstrapSession = useAuthStore((state) => state.bootstrapSession);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<CallJoinConfig | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { unreadCount } = useNotifications('all', hasHydrated && isAuthenticated);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      void bootstrapSession();
    }
  }, [bootstrapSession, hasHydrated, isAuthenticated]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (isAuthenticated) return;
    const timer = window.setTimeout(() => {
      if (!useAuthStore.getState().isAuthenticated) {
        router.replace('/login');
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [hasHydrated, isAuthenticated, router]);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/home')) return 'Home';
    if (pathname.startsWith('/chat')) return 'Messages';
    if (pathname.startsWith('/channels')) return 'Channels';
    if (pathname.startsWith('/calls')) return 'Calls';
    if (pathname.startsWith('/files')) return 'Files';
    if (pathname.startsWith('/notifications')) return 'Notifications';
    if (pathname.startsWith('/settings')) return 'Settings';
    if (pathname.startsWith('/admin')) return 'Admin';
    return 'Home';
  }, [pathname]);

  if (!hasHydrated || !isAuthenticated || !user) return null;

  const userInitials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-transparent p-2 md:h-screen md:p-3">
      <div className="mb-2 flex items-center justify-between rounded-[24px] border border-white/70 bg-white/82 px-4 py-3 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/58 md:px-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/80 text-muted-foreground transition hover:border-primary/20 hover:text-primary dark:bg-slate-900/70 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-2 md:flex">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">DSV Connect</p>
            <p className="text-sm font-medium text-foreground">{pageTitle}</p>
          </div>
        </div>

        <div className="mx-4 hidden max-w-[520px] flex-1 lg:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="dsv-input h-11 w-full rounded-full bg-white/88 pl-10 pr-24 dark:bg-slate-900/75"
              placeholder="Search messages, channels, files, or teammates"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Cmd K
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.mustChangePassword ? (
            <Link
              href="/settings?force=password-reset"
              className="hidden items-center gap-2 rounded-full bg-[#F59E0B]/12 px-3 py-2 text-xs font-medium text-[#B45309] transition-colors hover:bg-[#F59E0B]/18 dark:text-[#FBBF24] md:inline-flex"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Update temporary password
            </Link>
          ) : null}
          <button
            onClick={() => setNotificationsOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-2 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-primary/20 hover:text-primary dark:bg-slate-900/80"
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inbox</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className={cn(
          'mr-0 hidden w-[76px] shrink-0 flex-col items-center rounded-[30px] border border-[hsl(var(--rail-border))] bg-[linear-gradient(180deg,#FFFFFF,#F7F8FB)] px-3 py-4 shadow-[0_18px_42px_rgba(17,24,39,0.08)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(9,14,24,0.98))] md:mr-3 md:flex',
          mobileNavOpen && 'fixed inset-y-20 left-3 z-40 flex'
        )}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] text-sm font-semibold text-white shadow-[0_16px_30px_rgba(26,86,219,0.28)]">
          DSV
        </div>

        <div className="mb-5 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-primary">DSV</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Connect</p>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2">
          {primaryNav.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'group relative flex h-12 w-12 items-center justify-center rounded-2xl text-[hsl(var(--rail-foreground))] transition-all duration-150 hover:scale-110 hover:bg-white hover:text-primary dark:hover:bg-white/10',
                  active && 'bg-primary text-white shadow-[0_18px_34px_rgba(26,86,219,0.26)] hover:scale-100'
                )}
              >
                {active ? <span className="absolute -left-3 h-8 w-1 rounded-r-full bg-primary" /> : null}
                <Icon className="h-5 w-5" />
                {href === '/notifications' && unreadCount > 0 ? (
                  <span className="badge-pulse absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            );
          })}

        </nav>

        <div className="mt-auto flex flex-col items-center gap-2">
          {utilityNav.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl text-[hsl(var(--rail-foreground))] transition-all duration-150 hover:bg-white hover:text-primary dark:hover:bg-white/10',
                  active && 'bg-white text-primary shadow-[0_12px_28px_rgba(17,24,39,0.10)] dark:bg-white/10'
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}

          <button
            title={`Theme: ${theme}`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-[hsl(var(--rail-foreground))] transition-all duration-150 hover:bg-white hover:text-primary dark:hover:bg-white/10"
          >
            {theme === 'dark' ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setProfileOpen((current) => !current)}
            className="relative mt-1 flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1A56DB,#0E9F6E)] text-sm font-semibold text-white shadow-[0_16px_30px_rgba(17,24,39,0.18)]"
            title={user.name}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-full w-full rounded-full object-cover" />
            ) : (
              userInitials
            )}
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#0E9F6E] dark:border-slate-950" />
          </button>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-[28px] border border-white/70 bg-white/72 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42 md:rounded-[32px]">
        <div className="absolute inset-x-0 top-0 z-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(26,86,219,0.10),transparent_55%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.10),transparent_45%)]" />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="dsv-scroll flex-1 overflow-auto px-3 py-3 md:px-5 md:py-4">{children}</div>

          <div className="border-t border-border/60 bg-white/65 px-4 py-3 text-xs text-muted-foreground backdrop-blur dark:bg-slate-950/30 md:px-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p>DSV Connect workspace shell. Responsive collaboration surfaces for chat, calls, files, and team coordination.</p>
              <div className="flex items-center gap-3">
                <span>Secure session</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span>{user.tenant?.name || 'Workspace'}</span>
              </div>
            </div>
          </div>
        </div>

        {profileOpen ? (
          <div className="absolute right-5 top-24 z-30 w-[320px] rounded-[24px] border border-border bg-card p-5 shadow-[0_24px_60px_rgba(17,24,39,0.16)] animate-fadeIn">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] text-base font-semibold text-white">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    userInitials
                  )}
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.jobTitle || 'Workspace member'}</p>
                </div>
              </div>
              <button
                onClick={() => setProfileOpen(false)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl bg-muted/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile</p>
                <p className="mt-2 text-sm text-foreground">{user.email}</p>
                <p className="mt-1 text-sm text-muted-foreground">{user.department || 'Team collaboration'}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setProfileOpen(false)}
                className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <UserCog className="h-4 w-4 text-primary" />
                Open profile & settings
              </Link>
              <button
                onClick={() => logout()}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-600"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2 rounded-[22px] border border-white/70 bg-white/82 p-2 shadow-[0_16px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/58 md:hidden">
        {primaryNav.slice(0, 5).map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-medium text-muted-foreground transition',
                active && 'bg-primary text-white shadow-[0_12px_24px_rgba(26,86,219,0.22)]'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

      <IncomingCallAlert onAccept={setActiveCall} />
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      {activeCall ? (
        <CallOverlay
          config={activeCall}
          onLeave={() => setActiveCall(null)}
          participants={[]}
        />
      ) : null}
    </div>
  );
}
