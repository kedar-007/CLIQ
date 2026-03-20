import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '@comms/db';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createLogger } from '@comms/logger';
import type { JWTPayload } from '@comms/types';

const logger = createLogger('billing-service:routes');
export const billingRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });

function auth(req: any, res: Response, next: () => void): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload; next(); }
  catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}

// POST /billing/checkout — create Stripe Checkout Session for plan upgrade
billingRouter.post('/checkout', auth, async (req: any, res: Response) => {
  try {
    const { plan } = z.object({ plan: z.enum(['PRO', 'ENTERPRISE']) }).parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    if (!tenant) { res.status(404).json({ success: false, error: 'Tenant not found' }); return; }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });

    // Get or create Stripe customer
    let stripeCustomerId = tenant.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user?.email,
        name: tenant.name,
        metadata: { tenantId: tenant.id },
      });
      stripeCustomerId = customer.id;
      await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId } });
    }

    const priceId = plan === 'PRO'
      ? process.env.STRIPE_PRO_PRICE_ID!
      : process.env.STRIPE_ENTERPRISE_PRICE_ID!;

    const seatCount = await prisma.user.count({ where: { tenantId: tenant.id, isDeactivated: false } });

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: seatCount }],
      success_url: `${process.env.NEXTAUTH_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?cancelled=true`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenantId: tenant.id, plan },
      },
      metadata: { tenantId: tenant.id, plan },
    });

    res.json({ success: true, data: { checkoutUrl: session.url } });
  } catch (err) {
    logger.error('Checkout error', { err });
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

// POST /billing/portal — Stripe Customer Portal
billingRouter.post('/portal', auth, async (req: any, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    if (!tenant?.stripeCustomerId) {
      res.status(400).json({ success: false, error: 'No billing account found' }); return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL}/settings/billing`,
    });

    res.json({ success: true, data: { portalUrl: session.url } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create portal session' });
  }
});

// GET /billing/subscription — current subscription
billingRouter.get('/subscription', auth, async (req: any, res: Response) => {
  try {
    const subscription = await prisma.billingSubscription.findFirst({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { plan: true, trialEndsAt: true, stripeCustomerId: true },
    });

    const seatCount = await prisma.user.count({ where: { tenantId: req.user.tenantId, isDeactivated: false } });
    const storageResult = await prisma.attachment.aggregate({
      where: { channel: { tenantId: req.user.tenantId }, deletedAt: null },
      _sum: { fileSize: true },
    });

    res.json({
      success: true,
      data: {
        subscription,
        plan: tenant?.plan,
        trialEndsAt: tenant?.trialEndsAt,
        usage: {
          seats: seatCount,
          storageMb: Math.round((storageResult._sum.fileSize || 0) / (1024 * 1024)),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});

// GET /billing/invoices
billingRouter.get('/invoices', auth, async (req: any, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 24,
  });
  res.json({ success: true, data: invoices });
});

// POST /billing/webhooks/stripe — Stripe webhook handler
billingRouter.post('/webhooks/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.error('Webhook signature verification failed', { err });
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.CheckoutSession;
        const { tenantId, plan } = session.metadata || {};
        if (tenantId && plan) {
          await prisma.tenant.update({
            where: { id: tenantId },
            data: { plan: plan as any, stripePlanId: session.subscription as string },
          });
          logger.info('Plan upgraded', { tenantId, plan });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId;
        if (tenantId) {
          const planName = sub.status === 'active' ? (sub.metadata?.plan || 'FREE') : 'FREE';
          await prisma.tenant.update({
            where: { id: tenantId },
            data: { plan: planName as any },
          });
          await prisma.billingSubscription.upsert({
            where: { stripeSubscriptionId: sub.id },
            create: {
              tenantId,
              stripeSubscriptionId: sub.id,
              planId: sub.items.data[0]?.price.id || '',
              status: sub.status.toUpperCase() as any,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              seatCount: sub.items.data[0]?.quantity || 1,
            },
            update: {
              status: sub.status.toUpperCase() as any,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId;
        if (tenantId) {
          await prisma.tenant.update({ where: { id: tenantId }, data: { plan: 'FREE' } });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        const tenantId = (customer as Stripe.Customer).metadata?.tenantId;
        if (tenantId) {
          await prisma.invoice.upsert({
            where: { stripeInvoiceId: invoice.id },
            create: {
              tenantId,
              stripeInvoiceId: invoice.id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'PAID',
              pdfUrl: invoice.invoice_pdf || undefined,
              periodStart: new Date((invoice.period_start || 0) * 1000),
              periodEnd: new Date((invoice.period_end || 0) * 1000),
              paidAt: new Date(),
            },
            update: { status: 'PAID', paidAt: new Date() },
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook handler error', { event: event.type, err });
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});
