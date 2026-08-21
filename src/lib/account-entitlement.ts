import type { Org } from '@prisma/client'
import { getTier, moneyCmp, totalSpendable } from './tiers'

export type PaidServiceAccessPayload = {
  allowed: boolean
  paid_access: boolean
  reason: string | null
  organisation_id: string
  effective_at_ms: number
  has_active_subscription: boolean
  active_subscription_is_paid: boolean
  subscription_tier: number
  subscription_monthly_charge: number
  subscription_credits_remaining: number
  purchased_credits_remaining: number
  total_usable_credits: number
}

/**
 * Fork entitlement: usable credits &gt; 0 ⇒ paid access.
 * A paid plan name with $0 remaining is NOT paid (billing wall).
 */
export function buildPaidServiceAccess(org: Org): PaidServiceAccessPayload {
  const tier = getTier(org.subscriptionTierId || 'free')
  const subscriptionCredits = Number(org.subscriptionCreditsUsd || '0')
  const purchased = Number(org.balanceUsd || '0')
  const total = Number(
    totalSpendable(org.subscriptionCreditsUsd || '0', org.balanceUsd || '0'),
  )
  const hasUsable = Number.isFinite(total) && total > 0
  const isPaidPlan =
    Boolean(org.stripeSubscriptionId) && tier.tierId !== 'free'
  const hasActiveSub = isPaidPlan || tier.tierId !== 'free'

  return {
    allowed: hasUsable,
    paid_access: hasUsable,
    reason: hasUsable ? null : 'no_usable_credits',
    organisation_id: org.id,
    effective_at_ms: Date.now(),
    has_active_subscription: hasActiveSub,
    active_subscription_is_paid: isPaidPlan,
    subscription_tier: tier.tierOrder,
    subscription_monthly_charge: Number(tier.dollarsPerMonth),
    subscription_credits_remaining: subscriptionCredits,
    purchased_credits_remaining: purchased,
    total_usable_credits: total,
  }
}

export function buildOAuthAccountPayload(actor: {
  user: { email: string | null; privyDid: string }
  org: Org
}) {
  const { org, user } = actor
  const tier = getTier(org.subscriptionTierId || 'free')
  const access = buildPaidServiceAccess(org)
  const subscriptionCredits = access.subscription_credits_remaining

  return {
    user: {
      email: user.email,
      privy_did: user.privyDid,
    },
    organisation: {
      id: org.id,
      slug: org.slug,
      name: org.name,
    },
    subscription: {
      plan: org.subscriptionTierName || tier.name,
      tier: tier.tierOrder,
      monthly_charge: Number(tier.dollarsPerMonth),
      monthly_credits: Number(tier.monthlyCredits),
      current_period_end: org.cycleEndsAt?.toISOString() ?? null,
      credits_remaining: subscriptionCredits,
      rollover_credits: 0,
    },
    paid_service_access: access,
    // Free tool pool not shipped — fail closed (fork treats false as not entitled).
    tool_access: {
      enabled: false,
      coverage: {},
    },
  }
}

export function orgHasUsableCredits(org: Org): boolean {
  return moneyCmp(
    totalSpendable(org.subscriptionCreditsUsd || '0', org.balanceUsd || '0'),
    '0',
  ) > 0
}
