/**
 * Subscription change ops — mirrors fork V3 contract:
 * preview / pending-change / upgrade (+ Checkout for Free→paid).
 */
import type { Org } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from './db'
import { getStripe, portalBaseUrl } from './stripe'
import {
  getTier,
  isPaidTierId,
  moneySub,
  stripePriceId,
  type TierId,
} from './tiers'

export function recoveryUrl(orgId: string, plan?: string): string {
  const base = portalBaseUrl()
  const q = new URLSearchParams({ org_id: orgId })
  if (plan) q.set('plan', plan)
  return `${base}/manage-subscription?${q.toString()}`
}

export function managePortalPath(org: Pick<Org, 'id' | 'slug'>, plan?: string): string {
  const q = new URLSearchParams({ org_id: org.id })
  if (plan) q.set('plan', plan)
  return `/manage-subscription?${q.toString()}`
}

export async function applyTierToOrg(
  orgId: string,
  tierId: TierId,
  opts: {
    stripeSubscriptionId?: string | null
    cycleEndsAt?: Date | null
    clearPending?: boolean
  } = {},
) {
  const tier = getTier(tierId)
  const data: Record<string, unknown> = {
    subscriptionTierId: tier.tierId,
    subscriptionTierName: tier.name,
    subscriptionCreditsUsd: tier.monthlyCredits,
    spentThisPeriodUsd: '0',
  }
  if (opts.cycleEndsAt !== undefined) data.cycleEndsAt = opts.cycleEndsAt
  if (opts.stripeSubscriptionId !== undefined) {
    data.stripeSubscriptionId = opts.stripeSubscriptionId
  }
  if (opts.clearPending) {
    data.pendingDowngradeTierId = null
    data.pendingDowngradeTierName = null
    data.pendingDowngradeAt = null
    data.cancelAtPeriodEnd = false
  }
  return prisma.org.update({ where: { id: orgId }, data })
}

function periodEndFromSub(sub: Stripe.Subscription): Date {
  const itemEnd = sub.items?.data?.[0]?.current_period_end
  const ts =
    typeof itemEnd === 'number'
      ? itemEnd
      : Math.floor(Date.now() / 1000) + 30 * 24 * 3600
  return new Date(ts * 1000)
}

function subscriptionItemId(sub: Stripe.Subscription): string {
  const item = sub.items.data[0]
  if (!item) throw new Error('subscription_has_no_items')
  return item.id
}

function paymentIntentFromInvoice(
  invoice: Stripe.Invoice | Stripe.Invoice | null | undefined,
): Stripe.PaymentIntent | null {
  if (!invoice || typeof invoice === 'string') return null
  const pi = (
    invoice as Stripe.Invoice & {
      payment_intent?: string | Stripe.PaymentIntent | null
    }
  ).payment_intent
  if (!pi || typeof pi === 'string') return null
  return pi
}

export type PreviewResult = {
  effect: 'charge_now' | 'scheduled' | 'no_op' | 'blocked'
  reason?: string | null
  currentTierId: string | null
  currentTierName: string | null
  targetTierId: string
  targetTierName: string
  monthlyCreditsDelta: string | null
  amountDueNowCents: number | null
  effectiveAt: string | null
}

export async function previewSubscriptionChange(
  org: Org,
  targetTierId: string,
): Promise<PreviewResult> {
  const target = getTier(targetTierId)
  if (!isPaidTierId(target.tierId) && target.tierId !== 'free') {
    return {
      effect: 'blocked',
      reason: 'Unknown plan.',
      currentTierId: org.subscriptionTierId === 'free' ? null : org.subscriptionTierId,
      currentTierName:
        org.subscriptionTierId === 'free' ? null : org.subscriptionTierName,
      targetTierId: target.tierId,
      targetTierName: target.name,
      monthlyCreditsDelta: null,
      amountDueNowCents: null,
      effectiveAt: null,
    }
  }

  const currentId = (org.subscriptionTierId || 'free') as TierId
  const current = getTier(currentId)
  const currentTierId = currentId === 'free' ? null : currentId
  const currentTierName = currentId === 'free' ? null : current.name
  const creditsDelta = moneySub(target.monthlyCredits, current.monthlyCredits)

  if (currentId === target.tierId) {
    return {
      effect: 'no_op',
      reason: null,
      currentTierId,
      currentTierName,
      targetTierId: target.tierId,
      targetTierName: target.name,
      monthlyCreditsDelta: '0',
      amountDueNowCents: null,
      effectiveAt: null,
    }
  }

  // Free → paid: terminal must hand off to portal Checkout (fork contract).
  if (currentId === 'free') {
    return {
      effect: 'blocked',
      reason:
        'Start a paid plan on the portal — new subscriptions need Checkout.',
      currentTierId,
      currentTierName,
      targetTierId: target.tierId,
      targetTierName: target.name,
      monthlyCreditsDelta: creditsDelta,
      amountDueNowCents: null,
      effectiveAt: null,
    }
  }

  // Paid → free is cancellation (scheduled), not a tier_change upgrade path.
  if (target.tierId === 'free') {
    return {
      effect: 'scheduled',
      reason: null,
      currentTierId,
      currentTierName,
      targetTierId: 'free',
      targetTierName: 'Free',
      monthlyCreditsDelta: creditsDelta,
      amountDueNowCents: null,
      effectiveAt: org.cycleEndsAt?.toISOString() ?? null,
    }
  }

  if (target.tierOrder > current.tierOrder) {
    let amountDueNowCents: number | null = null
    if (org.stripeSubscriptionId) {
      try {
        const stripe = getStripe()
        const priceId = stripePriceId(target.tierId)
        const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId)
        const itemId = subscriptionItemId(sub)
        const upcoming = await stripe.invoices.createPreview({
          customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          subscription: sub.id,
          subscription_details: {
            items: [{ id: itemId, price: priceId }],
            proration_behavior: 'create_prorations',
          },
        })
        amountDueNowCents =
          typeof upcoming.amount_due === 'number' ? upcoming.amount_due : null
      } catch {
        // Fall back to full month when proration quote unavailable.
        amountDueNowCents = Math.round(Number(target.dollarsPerMonth) * 100)
      }
    } else {
      amountDueNowCents = Math.round(Number(target.dollarsPerMonth) * 100)
    }
    return {
      effect: 'charge_now',
      reason: null,
      currentTierId,
      currentTierName,
      targetTierId: target.tierId,
      targetTierName: target.name,
      monthlyCreditsDelta: creditsDelta,
      amountDueNowCents,
      effectiveAt: null,
    }
  }

  // Downgrade / same-price lateral → scheduled at period end.
  return {
    effect: 'scheduled',
    reason: null,
    currentTierId,
    currentTierName,
    targetTierId: target.tierId,
    targetTierName: target.name,
    monthlyCreditsDelta: creditsDelta,
    amountDueNowCents: null,
    effectiveAt: org.cycleEndsAt?.toISOString() ?? null,
  }
}

async function ensureDefaultPaymentMethod(org: Org): Promise<string> {
  if (!org.stripeDefaultPmId) {
    const err = new Error('no_payment_method')
    ;(err as Error & { code: string }).code = 'no_payment_method'
    throw err
  }
  return org.stripeDefaultPmId
}

export type UpgradeResult = {
  status: 'upgraded' | 'already_on_tier' | 'requires_action' | 'payment_failed'
  targetTierName: string
  recoveryUrl?: string | null
  reason?: string | null
  idempotencyKey: string
}

export async function upgradeSubscription(
  org: Org,
  targetTierId: string,
  idempotencyKey: string,
): Promise<UpgradeResult> {
  const target = getTier(targetTierId)
  if (!isPaidTierId(target.tierId)) {
    return {
      status: 'payment_failed',
      targetTierName: target.name,
      reason: 'invalid_subscription_type',
      recoveryUrl: recoveryUrl(org.id),
      idempotencyKey,
    }
  }

  const currentId = (org.subscriptionTierId || 'free') as TierId
  if (currentId === target.tierId && org.stripeSubscriptionId) {
    return {
      status: 'already_on_tier',
      targetTierName: target.name,
      idempotencyKey,
    }
  }

  if (currentId !== 'free' && getTier(currentId).tierOrder >= target.tierOrder) {
    return {
      status: 'payment_failed',
      targetTierName: target.name,
      reason: 'not_an_upgrade',
      recoveryUrl: recoveryUrl(org.id, target.tierId),
      idempotencyKey,
    }
  }

  // Free → paid must use Checkout (fork: terminal never charges a new sub).
  if (currentId === 'free' || !org.stripeSubscriptionId) {
    return {
      status: 'requires_action',
      targetTierName: target.name,
      reason: 'authentication_required',
      recoveryUrl: recoveryUrl(org.id, target.tierId),
      idempotencyKey,
    }
  }

  const stripe = getStripe()
  const priceId = stripePriceId(target.tierId)
  const pmId = await ensureDefaultPaymentMethod(org)

  try {
    const existing = await stripe.subscriptions.retrieve(org.stripeSubscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    })
    const itemId = subscriptionItemId(existing)

    const updated = await stripe.subscriptions.update(
      org.stripeSubscriptionId,
      {
        items: [{ id: itemId, price: priceId }],
        default_payment_method: pmId,
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        cancel_at_period_end: false,
        metadata: {
          orgId: org.id,
          subscriptionTypeId: target.tierId,
        },
        expand: ['latest_invoice.payment_intent'],
      },
      { idempotencyKey },
    )

    const invoice = updated.latest_invoice as Stripe.Invoice | null
    const pi = paymentIntentFromInvoice(invoice)
    if (pi?.status === 'requires_action' || pi?.status === 'requires_confirmation') {
      return {
        status: 'requires_action',
        targetTierName: target.name,
        reason: 'subscription_payment_intent_requires_action',
        recoveryUrl: recoveryUrl(org.id, target.tierId),
        idempotencyKey,
      }
    }
    if (pi && pi.status !== 'succeeded' && pi.status !== 'processing') {
      return {
        status: 'payment_failed',
        targetTierName: target.name,
        reason: 'card_declined',
        recoveryUrl: recoveryUrl(org.id, target.tierId),
        idempotencyKey,
      }
    }

    await applyTierToOrg(org.id, target.tierId, {
      stripeSubscriptionId: updated.id,
      cycleEndsAt: periodEndFromSub(updated),
      clearPending: true,
    })

    return {
      status: 'upgraded',
      targetTierName: target.name,
      idempotencyKey,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    const code = (err as { code?: string }).code
    if (code === 'no_payment_method') {
      return {
        status: 'requires_action',
        targetTierName: target.name,
        reason: 'authentication_required',
        recoveryUrl: recoveryUrl(org.id, target.tierId),
        idempotencyKey,
      }
    }
    if (
      message.includes('authentication_required') ||
      message.includes('requires_action')
    ) {
      return {
        status: 'requires_action',
        targetTierName: target.name,
        reason: 'subscription_payment_intent_requires_action',
        recoveryUrl: recoveryUrl(org.id, target.tierId),
        idempotencyKey,
      }
    }
    if (message.includes('card') || message.includes('declined')) {
      return {
        status: 'payment_failed',
        targetTierName: target.name,
        reason: 'card_declined',
        recoveryUrl: recoveryUrl(org.id, target.tierId),
        idempotencyKey,
      }
    }
    throw err
  }
}

export async function schedulePendingChange(
  org: Org,
  body: { type: 'cancellation' } | { type: 'tier_change'; subscriptionTypeId: string },
) {
  if (body.type === 'cancellation') {
    if (!org.stripeSubscriptionId) {
      // Already free — no-op success.
      return {
        rail: 'stripe' as const,
        cancelAtPeriodEnd: true,
        message: 'No active paid subscription to cancel.',
      }
    }
    const stripe = getStripe()
    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
    await prisma.org.update({
      where: { id: org.id },
      data: {
        cancelAtPeriodEnd: true,
        pendingDowngradeTierId: null,
        pendingDowngradeTierName: null,
        pendingDowngradeAt: org.cycleEndsAt,
      },
    })
    return {
      rail: 'stripe' as const,
      cancelAtPeriodEnd: true,
      message:
        'Scheduled — your plan stays active until the end of the billing period, then it cancels.',
    }
  }

  const target = getTier(body.subscriptionTypeId)
  const current = getTier(org.subscriptionTierId || 'free')
  if (target.tierId === current.tierId) {
    return {
      rail: 'stripe' as const,
      changeType: 'tier_change' as const,
      targetTierName: target.name,
      message: 'Already on that plan.',
    }
  }
  if (target.tierOrder > current.tierOrder) {
    const err = new Error('Upgrades must use POST /subscription/upgrade')
    ;(err as Error & { code: string }).code = 'upgrade_not_allowed_here'
    throw err
  }
  if (!org.stripeSubscriptionId) {
    const err = new Error('No active subscription')
    ;(err as Error & { code: string }).code = 'no_subscription'
    throw err
  }

  const stripe = getStripe()
  const priceId = stripePriceId(target.tierId)
  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId)
  // Release any prior schedule, then create a two-phase schedule.
  if (sub.schedule) {
    const scheduleId =
      typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id
    try {
      await stripe.subscriptionSchedules.release(scheduleId)
    } catch {
      // continue — may already be released
    }
  }

  const fresh = await stripe.subscriptions.retrieve(org.stripeSubscriptionId)
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: fresh.id,
  })
  const currentPrice =
    fresh.items.data[0]?.price && typeof fresh.items.data[0].price !== 'string'
      ? fresh.items.data[0].price.id
      : typeof fresh.items.data[0]?.price === 'string'
        ? fresh.items.data[0].price
        : null
  if (!currentPrice) throw new Error('subscription_missing_price')

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        items: [{ price: currentPrice, quantity: 1 }],
        start_date: schedule.phases[0]?.start_date,
        end_date: fresh.items.data[0]?.current_period_end,
      },
      {
        items: [{ price: priceId, quantity: 1 }],
      },
    ],
  })

  const periodEnd = periodEndFromSub(fresh)
  await prisma.org.update({
    where: { id: org.id },
    data: {
      pendingDowngradeTierId: target.tierId,
      pendingDowngradeTierName: target.name,
      pendingDowngradeAt: org.cycleEndsAt ?? periodEnd,
      cancelAtPeriodEnd: false,
    },
  })

  return {
    rail: 'stripe' as const,
    changeType: 'tier_change' as const,
    targetTierName: target.name,
    message:
      'Scheduled — your plan does not change today. It switches at period end.',
  }
}

export async function clearPendingChange(org: Org) {
  if (org.stripeSubscriptionId) {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId)
    if (sub.cancel_at_period_end) {
      await stripe.subscriptions.update(org.stripeSubscriptionId, {
        cancel_at_period_end: false,
      })
    }
    if (sub.schedule) {
      const scheduleId =
        typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id
      try {
        await stripe.subscriptionSchedules.release(scheduleId)
      } catch {
        // ignore
      }
    }
  }
  await prisma.org.update({
    where: { id: org.id },
    data: {
      pendingDowngradeTierId: null,
      pendingDowngradeTierName: null,
      pendingDowngradeAt: null,
      cancelAtPeriodEnd: false,
    },
  })
  return {
    rail: 'stripe' as const,
    cancelAtPeriodEnd: false,
    message: 'Pending plan change cleared — current plan will renew.',
  }
}

/** Portal Free→paid (or cardless upgrade): Stripe Checkout mode=subscription. */
export async function createSubscriptionCheckout(
  org: Org,
  targetTierId: string,
  customerId: string,
  returnPath?: string,
): Promise<{ url: string; sessionId: string }> {
  const target = getTier(targetTierId)
  if (!isPaidTierId(target.tierId)) {
    throw new Error('invalid_subscription_type')
  }
  const stripe = getStripe()
  const priceId = stripePriceId(target.tierId)
  const base = portalBaseUrl()
  const success =
    returnPath && returnPath.startsWith('/')
      ? `${base}${returnPath}`
      : `${base}/orgs/${org.slug}/billing?plan=upgraded`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_types: ['card'],
    success_url: success,
    cancel_url: `${base}/manage-subscription?org_id=${encodeURIComponent(org.id)}&plan=${encodeURIComponent(target.tierId)}`,
    client_reference_id: org.id,
    metadata: {
      orgId: org.id,
      subscriptionTypeId: target.tierId,
      purpose: 'subscribe',
    },
    subscription_data: {
      metadata: {
        orgId: org.id,
        subscriptionTypeId: target.tierId,
      },
    },
  })
  if (!session.url) throw new Error('checkout_missing_url')
  return { url: session.url, sessionId: session.id }
}

/** Apply org tier from an active Stripe subscription object. */
export async function syncOrgFromStripeSubscription(
  orgId: string,
  sub: Stripe.Subscription,
  fallbackTierId?: string,
) {
  const priceId =
    typeof sub.items.data[0]?.price === 'string'
      ? sub.items.data[0].price
      : sub.items.data[0]?.price?.id
  let tierId = (fallbackTierId || 'plus') as TierId
  if (priceId) {
    const { tierIdFromPriceId } = await import('./tiers')
    const mapped = tierIdFromPriceId(priceId)
    if (mapped) tierId = mapped
  } else if (sub.metadata?.subscriptionTypeId) {
    tierId = sub.metadata.subscriptionTypeId as TierId
  }

  if (sub.status === 'canceled') {
    await applyTierToOrg(orgId, 'free', {
      stripeSubscriptionId: null,
      cycleEndsAt: periodEndFromSub(sub),
      clearPending: true,
    })
    return
  }

  if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
    await applyTierToOrg(orgId, tierId, {
      stripeSubscriptionId: sub.id,
      cycleEndsAt: periodEndFromSub(sub),
      clearPending: !sub.cancel_at_period_end && !sub.schedule,
    })
    if (sub.cancel_at_period_end) {
      await prisma.org.update({
        where: { id: orgId },
        data: {
          cancelAtPeriodEnd: true,
          pendingDowngradeAt: periodEndFromSub(sub),
        },
      })
    }
  }
}
