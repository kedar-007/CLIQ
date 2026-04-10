'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { CallOverlay } from '@/components/chat/call-overlay';
import { IncomingCallAlert } from '@/components/chat/incoming-call-alert';
import { NotificationPanel } from '@/components/chat/notification-panel';
import { useNotifications } from '@/hooks/use-notifications';
import {
  MessageSquare, Phone, Calendar, CheckSquare,
  FolderOpen, Search, Bell, Settings, LogOut, User, Sun, Moon, Laptop
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import type { CallJoinConfig } from '@comms/types';

const navItems = [
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/calls', icon: Phone, label: 'Calls' },
  { href: '/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/files', icon: FolderOpen, label: 'Files' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const hasHydrated = useAuthStore(s => s.hasHydrated);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const bootstrapSession = useAuthStore(s => s.bootstrapSession);
  const { theme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<CallJoinConfig | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount } = useNotifications('all', hasHydrated && isAuthenticated);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      void bootstrapSession();
    }
  }, [bootstrapSession, hasHydrated, isAuthenticated]);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      const timer = window.setTimeout(() => {
        if (!useAuthStore.getState().isAuthenticated) {
          router.replace('/login');
        }
      }, 350);

      return () => window.clearTimeout(timer);
    }
  }, [hasHydrated, isAuthenticated, router]);

  if (!hasHydrated) return null;
  if (!isAuthenticated) return null;

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const cycleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(nextTheme);
  };
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_22%),linear-gradient(180deg,hsl(var(--nav-background)),hsl(var(--background)))]">
      {/* Nav Rail - leftmost column */}
      <nav className="w-[68px] flex-shrink-0 flex flex-col items-center py-4 gap-2 border-r border-white/5 bg-[linear-gradient(180deg,rgba(8,47,73,0.92),rgba(15,23,42,0.98))] backdrop-blur-xl">
        {/* Logo */}
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-sm font-bold text-white shadow-[0_18px_44px_rgba(8,145,178,0.35)]">
          DS
        </div>

        {/* Nav items */}
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-150',
                isActive
                  ? 'bg-white/15 text-white shadow-[0_16px_38px_rgba(34,211,238,0.18)]'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full -ml-px" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </Link>
          );
        })}

        {/* Bottom items */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            title="Search"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/90 transition-all"
          >
            <Search size={18} strokeWidth={1.8} />
          </button>
          <button
            title="Notifications"
            onClick={() => setNotificationsOpen(true)}
            className="relative w-11 h-11 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/90 transition-all"
          >
            <Bell size={18} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex min-w-[16px] items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-semibold text-slate-950">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            title={`Theme: ${theme || 'system'}`}
            onClick={cycleTheme}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/90 transition-all"
          >
            <ThemeIcon size={18} strokeWidth={1.8} />
          </button>
          <Link
            href="/settings"
            title="Settings"
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center transition-all',
              pathname.startsWith('/settings')
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:bg-white/10 hover:text-white/90'
            )}
          >
            <Settings size={18} strokeWidth={1.8} />
          </Link>

          {/* User avatar */}
          <div className="relative mt-1">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-xs font-semibold text-white ring-2 ring-white/20 transition-all hover:ring-white/40"
            >
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : initials
              }
            </button>
            {/* Presence dot */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[hsl(var(--nav-background))]" />

            {/* User menu */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-full mb-0 ml-2 w-56 bg-popover border border-border rounded-xl shadow-xl z-50 p-1.5 animate-fadeIn">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-sm font-semibold text-popover-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-popover-foreground hover:bg-accent transition-colors">
                  <User size={14} className="text-muted-foreground" />
                  Profile & Settings
                </Link>
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main area */}
      <div className="m-2 flex min-w-0 flex-1 overflow-hidden rounded-[26px] border border-white/10 bg-background/95 shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {user?.mustChangePassword && (
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-100">
              <div className="flex items-center justify-between gap-4">
                <p>
                  This account is still using a temporary password. Update it from{' '}
                  <Link href="/settings?force=password-reset" className="font-semibold text-amber-200 underline underline-offset-4">
                    Profile &amp; Settings
                  </Link>
                  {' '}when you are ready.
                </p>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>

      <IncomingCallAlert onAccept={setActiveCall} />
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      {activeCall && (
        <CallOverlay
          config={activeCall}
          onLeave={() => setActiveCall(null)}
          participants={[]}
        />
      )}
    </div>
  );
}
