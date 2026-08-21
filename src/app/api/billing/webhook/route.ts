import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { syncCardFromCustomer } from '@/lib/stripe-customer'
import {
  applyTierToOrg,
  syncOrgFromStripeSubscription,
} from '@/lib/subscription-ops'
import { getTier, isPaidTierId, type TierId } from '@/lib/tiers'

export const runtime = 'nodejs'

function cycleEndFromSub(sub: Stripe.Subscription): Date {
  const itemEnd = sub.items?.data?.[0]?.current_period_end
  const ts =
    typeof itemEnd === 'number'
      ? itemEnd
      : Math.floor(Date.now() / 1000) + 30 * 24 * 3600
  return new Date(ts * 1000)
}

/**
 * POST /api/billing/webhook — Stripe webhooks.
 * - setup Checkout → save card
 * - subscription Checkout → apply paid tier
 * - subscription updated/deleted → sync org
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const stripe = getStripe()
  const raw = await req.text()
  const sig = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    if (secret) {
      event = stripe.webhooks.constructEvent(raw, sig, secret)
    } else {
      event = JSON.parse(raw) as Stripe.Event
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_payload'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.orgId
      const customerId =
        typeof session.customer === 'string' ? session.customer : null

      if (session.mode === 'setup' && orgId && customerId) {
        await prisma.org.update({
          where: { id: orgId },
          data: { stripeCustomerId: customerId },
        })
        if (session.setup_intent) {
          try {
            const si = await stripe.setupIntents.retrieve(
              String(session.setup_intent),
            )
            if (typeof si.payment_method === 'string') {
              await stripe.customers.update(customerId, {
                invoice_settings: {
                  default_payment_method: si.payment_method,
                },
              })
            }
          } catch {
            // sync from list below
          }
        }
        await syncCardFromCustomer(orgId, customerId)
      }

      if (session.mode === 'subscription' && orgId) {
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id
        const tierMeta = session.metadata?.subscriptionTypeId
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await syncOrgFromStripeSubscription(
            orgId,
            sub,
            tierMeta && isPaidTierId(tierMeta) ? tierMeta : undefined,
          )
          if (customerId) {
            await prisma.org.update({
              where: { id: orgId },
              data: { stripeCustomerId: customerId },
            })
            await syncCardFromCustomer(orgId, customerId)
          }
        } else if (tierMeta && isPaidTierId(tierMeta)) {
          await applyTierToOrg(orgId, tierMeta as TierId, {
            clearPending: true,
          })
        }
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription
      const orgId =
        sub.metadata?.orgId ||
        (
          await prisma.org.findFirst({
            where: { stripeSubscriptionId: sub.id },
            select: { id: true },
          })
        )?.id
      if (orgId) {
        await syncOrgFromStripeSubscription(orgId, sub)
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const parentSub = invoice.parent?.subscription_details?.subscription
      const subId =
        typeof parentSub === 'string'
          ? parentSub
          : parentSub && typeof parentSub !== 'string'
            ? parentSub.id
            : null
      if (subId) {
        const org = await prisma.org.findFirst({
          where: { stripeSubscriptionId: subId },
        })
        if (org) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await syncOrgFromStripeSubscription(org.id, sub)
          // Refresh monthly subscription credits on renewal.
          if (invoice.billing_reason === 'subscription_cycle') {
            const tier = getTier(org.subscriptionTierId || 'free')
            await prisma.org.update({
              where: { id: org.id },
              data: {
                subscriptionCreditsUsd: tier.monthlyCredits,
                spentThisPeriodUsd: '0',
                cycleEndsAt: cycleEndFromSub(sub),
              },
            })
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook_handler_error'
    console.error('[stripe webhook]', event.type, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
