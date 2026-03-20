'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Loader2, Zap, Building2, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';

interface ChangePlanDialogProps {
  tenantId: string;
  tenantName: string;
  currentPlan: Plan;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PLAN_DETAILS: Record<
  Plan,
  {
    label: string;
    price: string;
    description: string;
    icon: React.ElementType;
    color: string;
    features: string[];
  }
> = {
  FREE: {
    label: 'Free',
    price: '$0 / month',
    description: 'For small teams getting started',
    icon: Zap,
    color: 'border-gray-200 dark:border-gray-700',
    features: [
      'Up to 10 users',
      '5 GB storage',
      '10 channels',
      'Basic messaging',
      'Community support',
      '90-day message history',
    ],
  },
  PRO: {
    label: 'Pro',
    price: '$12 / user / month',
    description: 'For growing teams that need more power',
    icon: Sparkles,
    color: 'border-blue-400 dark:border-blue-500',
    features: [
      'Unlimited users',
      '50 GB storage',
      'Unlimited channels',
      'Audio & video calls',
      'File sharing & search',
      'Priority support',
      'Unlimited message history',
      'Custom integrations',
    ],
  },
  ENTERPRISE: {
    label: 'Enterprise',
    price: 'Custom pricing',
    description: 'For large organizations with advanced needs',
    icon: Building2,
    color: 'border-purple-400 dark:border-purple-500',
    features: [
      'Everything in Pro',
      '1 TB+ storage',
      'SSO / SAML',
      'Advanced audit logs',
      'SLA guarantee',
      'Dedicated account manager',
      'Custom data retention',
      'On-premise deployment option',
      'Advanced security controls',
    ],
  },
};

export function ChangePlanDialog({
  tenantId,
  tenantName,
  currentPlan,
  open,
  onClose,
  onSuccess,
}: ChangePlanDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(currentPlan);

  const mutation = useMutation({
    mutationFn: () => adminApi.updateTenant(tenantId, { plan: selectedPlan }),
    onSuccess: () => {
      toast.success(`Plan updated to ${PLAN_DETAILS[selectedPlan].label}`);
      onSuccess?.();
      onClose();
    },
    onError: () => toast.error('Failed to update plan'),
  });

  const handleClose = () => {
    if (!mutation.isPending) {
      setSelectedPlan(currentPlan);
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Change Plan
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-0.5">
                Updating subscription plan for{' '}
                <span className="font-medium text-foreground">{tenantName}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                onClick={handleClose}
                className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            {(Object.keys(PLAN_DETAILS) as Plan[]).map((plan) => {
              const details = PLAN_DETAILS[plan];
              const Icon = details.icon;
              const isSelected = selectedPlan === plan;
              const isCurrent = currentPlan === plan;

              return (
                <button
                  key={plan}
                  onClick={() => setSelectedPlan(plan)}
                  className={cn(
                    'relative flex flex-col rounded-xl border-2 p-4 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : cn('hover:border-muted-foreground/40 bg-background', details.color)
                  )}
                >
                  {isCurrent && (
                    <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Current
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{details.label}</p>
                      <p className="text-xs text-muted-foreground">{details.price}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">{details.description}</p>

                  <ul className="space-y-1.5">
                    {details.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-500 mt-0.5" />
                        <span className="text-xs text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isSelected && (
                    <div className="absolute top-3 left-3">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {selectedPlan !== currentPlan ? (
                <>
                  Changing from{' '}
                  <span className="font-medium text-foreground">{PLAN_DETAILS[currentPlan].label}</span>
                  {' '}to{' '}
                  <span className="font-medium text-foreground">{PLAN_DETAILS[selectedPlan].label}</span>
                </>
              ) : (
                'No changes to apply'
              )}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                disabled={mutation.isPending}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || selectedPlan === currentPlan}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mutation.isPending ? 'Updating...' : 'Update Plan'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
