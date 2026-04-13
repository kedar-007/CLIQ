'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Loader2, MessageSquare, Building2, User, Mail, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

interface RegisterForm {
  workspaceName: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const steps = ['Workspace', 'Account', 'Password'];

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, watch, trigger, formState: { errors } } = useForm<RegisterForm>();
  const password = watch('password', '');

  const passwordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strength = passwordStrength(password);
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

  const goNext = async () => {
    const fields: (keyof RegisterForm)[][] = [
      ['workspaceName'],
      ['name', 'email'],
      ['password', 'confirmPassword'],
    ];
    const valid = await trigger(fields[step]);
    if (valid) setStep(s => s + 1);
  };

  const onSubmit = async (data: RegisterForm) => {
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName: data.workspaceName,
          name: data.name,
          email: data.email,
          password: data.password,
        }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Registration failed'); return; }
      login(json.data.user, json.data.accessToken);
      router.push('/home');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Create your workspace</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Get your team communicating in minutes</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all flex-shrink-0',
                i < step ? 'bg-primary text-primary-foreground' :
                i === step ? 'bg-primary/20 text-primary ring-2 ring-primary/30' :
                'bg-muted text-muted-foreground'
              )}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={cn(
                'text-xs font-medium flex-1',
                i <= step ? 'text-foreground' : 'text-muted-foreground'
              )}>{s}</span>
              {i < steps.length - 1 && (
                <div className={cn('flex-1 h-px', i < step ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-7">
          {error && (
            <div className="mb-5 px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 0: Workspace */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[15px]">Name your workspace</h2>
                    <p className="text-xs text-muted-foreground">This is your company or team name</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Workspace name</label>
                  <input
                    {...register('workspaceName', { required: 'Workspace name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
                    type="text"
                    placeholder="e.g. Acme Corp, My Team"
                    autoFocus
                    className={cn(
                      'w-full h-11 px-4 rounded-xl border bg-background text-sm outline-none transition-all',
                      'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                      errors.workspaceName ? 'border-destructive' : 'border-input'
                    )}
                  />
                  {errors.workspaceName && <p className="mt-1 text-xs text-destructive">{errors.workspaceName.message}</p>}
                </div>
              </div>
            )}

            {/* Step 1: Account */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <User size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[15px]">Create your account</h2>
                    <p className="text-xs text-muted-foreground">You'll be the workspace admin</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Your full name</label>
                  <input
                    {...register('name', { required: 'Name is required' })}
                    type="text"
                    placeholder="John Doe"
                    autoFocus
                    className={cn(
                      'w-full h-11 px-4 rounded-xl border bg-background text-sm outline-none transition-all',
                      'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                      errors.name ? 'border-destructive' : 'border-input'
                    )}
                  />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Work email</label>
                  <input
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' }
                    })}
                    type="email"
                    placeholder="you@company.com"
                    className={cn(
                      'w-full h-11 px-4 rounded-xl border bg-background text-sm outline-none transition-all',
                      'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                      errors.email ? 'border-destructive' : 'border-input'
                    )}
                  />
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
                </div>
              </div>
            )}

            {/* Step 2: Password */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Lock size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[15px]">Secure your account</h2>
                    <p className="text-xs text-muted-foreground">Use a strong, unique password</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      {...register('password', {
                        required: 'Password is required',
                        minLength: { value: 8, message: 'Minimum 8 characters' }
                      })}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      autoFocus
                      className={cn(
                        'w-full h-11 px-4 pr-11 rounded-xl border bg-background text-sm outline-none transition-all',
                        'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                        errors.password ? 'border-destructive' : 'border-input'
                      )}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}

                  {/* Strength indicator */}
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= strength ? strengthColors[strength] : 'bg-muted')} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{strengthLabels[strength]} password</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Confirm password</label>
                  <input
                    {...register('confirmPassword', {
                      required: 'Please confirm password',
                      validate: v => v === password || 'Passwords do not match',
                    })}
                    type="password"
                    placeholder="Repeat your password"
                    className={cn(
                      'w-full h-11 px-4 rounded-xl border bg-background text-sm outline-none transition-all',
                      'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                      errors.confirmPassword ? 'border-destructive' : 'border-input'
                    )}
                  />
                  {errors.confirmPassword && <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className={cn('flex mt-7', step > 0 ? 'justify-between' : 'justify-end')}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="h-11 px-5 rounded-xl border border-input text-sm font-medium hover:bg-accent transition-colors"
                >
                  Back
                </button>
              )}

              {step < 2 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {isLoading && <Loader2 size={15} className="animate-spin" />}
                  {isLoading ? 'Creating workspace…' : 'Create workspace'}
                </button>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have a workspace?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-xs text-muted-foreground/60 mt-3">
          By creating an account, you agree to our{' '}
          <a href="#" className="underline hover:text-muted-foreground">Terms</a> and{' '}
          <a href="#" className="underline hover:text-muted-foreground">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
