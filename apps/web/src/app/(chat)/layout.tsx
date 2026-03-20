'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  MessageSquare, Phone, Calendar, CheckSquare,
  FolderOpen, Search, Bell, Settings, LogOut, User, ChevronDown
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

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
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--nav-background))]">
      {/* Nav Rail - leftmost column */}
      <nav className="w-[60px] flex-shrink-0 flex flex-col items-center py-3 gap-1 bg-[hsl(var(--nav-background))]">
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm mb-3 shadow-lg">
          C
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
                'relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 group',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full -ml-px" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
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
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/90 transition-all"
          >
            <Bell size={18} strokeWidth={1.8} />
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
              className="w-9 h-9 rounded-full ring-2 ring-white/20 hover:ring-white/40 transition-all overflow-hidden flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-semibold"
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
      <div className="flex flex-1 min-w-0 bg-background rounded-l-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}
