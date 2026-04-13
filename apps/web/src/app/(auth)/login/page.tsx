'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

interface LoginForm {
  email: string;
  password: string;
  mfaToken?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, hasHydrated, bootstrapSession, user } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      void bootstrapSession();
    }
  }, [bootstrapSession, hasHydrated, isAuthenticated]);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      router.replace(user?.mustChangePassword ? '/settings?force=password-reset' : '/home');
    }
  }, [hasHydrated, isAuthenticated, router, user?.mustChangePassword]);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const json = await res.json();

      if (json.requiresMfa) { setRequiresMfa(true); return; }
      if (!json.success) { setError(json.error || 'Login failed'); return; }

      login(json.data.user, json.data.accessToken);
      router.push(json.data.user?.mustChangePassword ? '/settings?force=password-reset' : '/home');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col justify-between p-12 bg-gradient-to-br from-violet-600 via-indigo-700 to-indigo-900 text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-white/5 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">CLIQ</span>
          </div>
        </div>

        <div className="relative space-y-6">
          <div>
            <h1 className="text-4xl font-bold leading-tight">
              Your team,<br />one platform.
            </h1>
            <p className="mt-4 text-white/70 text-lg leading-relaxed">
              Chat, calls, tasks, files — everything your team needs, beautifully unified.
            </p>
          </div>

          <div className="space-y-3">
            {[
              'Real-time messaging with threads',
              'HD video and voice calls',
              'Integrated tasks and calendar',
              'Enterprise-grade security',
            ].map(feat => (
              <div key={feat} className="flex items-center gap-3 text-white/80">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
                <span className="text-sm">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <p className="text-white/40 text-xs">© 2026 CLIQ. Enterprise Communications Platform.</p>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 justify-center mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">CLIQ</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-1.5">Sign in to your workspace</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm">
              <ShieldCheck size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Work email
              </label>
              <input
                {...register('email', { required: 'Email is required' })}
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                className={cn(
                  'w-full h-11 px-4 rounded-xl border bg-background text-sm outline-none transition-all',
                  'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                  errors.email ? 'border-destructive' : 'border-input'
                )}
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register('password', { required: 'Password is required' })}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(
                    'w-full h-11 px-4 pr-11 rounded-xl border bg-background text-sm outline-none transition-all',
                    'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                    errors.password ? 'border-destructive' : 'border-input'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {requiresMfa && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Authentication Code
                </label>
                <input
                  {...register('mfaToken')}
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring focus:border-ring tracking-[0.3em] text-center font-mono"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-background text-xs text-muted-foreground">or continue with</span>
            </div>
          </div>

          {/* OAuth */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { name: 'Google', href: '/api/oauth/google', color: 'text-red-600' },
              { name: 'GitHub', href: '/api/oauth/github', color: 'text-foreground' },
              { name: 'Microsoft', href: '/api/oauth/microsoft', color: 'text-blue-600' },
            ].map(p => (
              <a
                key={p.name}
                href={p.href}
                className="flex items-center justify-center h-10 rounded-xl border border-input bg-background text-sm font-medium hover:bg-accent transition-colors"
              >
                <span className={cn('text-xs font-medium', p.color)}>{p.name}</span>
              </a>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Create workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
