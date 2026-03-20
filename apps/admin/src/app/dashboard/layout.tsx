'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Avatar from '@radix-ui/react-avatar';
import {
  LayoutDashboard,
  Building2,
  Users,
  Hash,
  BarChart3,
  FileText,
  ClipboardList,
  Puzzle,
  CreditCard,
  Settings,
  Moon,
  Sun,
  Monitor,
  LogOut,
  ChevronDown,
  Shield,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

const navSections = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Tenants', href: '/dashboard/tenants', icon: Building2 },
      { label: 'Users', href: '/dashboard/users', icon: Users },
      { label: 'Channels', href: '/dashboard/channels', icon: Hash },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Usage', href: '/dashboard/analytics', icon: BarChart3 },
      { label: 'Reports', href: '/dashboard/reports', icon: FileText },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Audit Logs', href: '/dashboard/audit-logs', icon: ClipboardList },
      { label: 'Integrations', href: '/dashboard/integrations', icon: Puzzle },
      { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg text-sm"
        >
          {[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor },
          ].map(({ value, label, icon: Icon }) => (
            <DropdownMenu.Item
              key={value}
              onSelect={() => setTheme(value)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-foreground outline-none hover:bg-muted',
                theme === value && 'font-medium text-primary'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { adminUser, isAuthenticated, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  if (!isAuthenticated) return null;

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary">
          <Shield className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-semibold text-sidebar-foreground text-sm">DSV-CLIQ Admin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <Avatar.Root className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
            <Avatar.Image
              src={adminUser?.avatarUrl}
              alt={adminUser?.name}
              className="h-full w-full object-cover"
            />
            <Avatar.Fallback className="flex h-full w-full items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
              {adminUser?.name?.charAt(0).toUpperCase() || 'A'}
            </Avatar.Fallback>
          </Avatar.Root>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-sidebar-foreground">
              {adminUser?.name || 'Admin'}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/50">
              {adminUser?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-60 flex-col bg-sidebar border-r border-sidebar-border">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top navbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-1 text-sm">
              {(() => {
                const segments = pathname.split('/').filter(Boolean);
                return segments.map((seg, i) => {
                  const isLast = i === segments.length - 1;
                  return (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground">/</span>}
                      <span
                        className={cn(
                          'capitalize',
                          isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {seg.replace(/-/g, ' ')}
                      </span>
                    </span>
                  );
                });
              })()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* User menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
                  <Avatar.Root className="h-7 w-7 overflow-hidden rounded-full">
                    <Avatar.Image
                      src={adminUser?.avatarUrl}
                      alt={adminUser?.name}
                      className="h-full w-full object-cover"
                    />
                    <Avatar.Fallback className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground text-xs font-semibold">
                      {adminUser?.name?.charAt(0).toUpperCase() || 'A'}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <span className="hidden sm:block text-sm font-medium text-foreground">
                    {adminUser?.name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg text-sm"
                >
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="font-medium text-foreground text-xs">{adminUser?.name}</p>
                    <p className="text-muted-foreground text-xs">{adminUser?.email}</p>
                  </div>
                  <DropdownMenu.Item
                    onSelect={handleLogout}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-destructive outline-none hover:bg-destructive/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
