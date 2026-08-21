import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { getTier } from '@/lib/tiers'

export const runtime = 'nodejs'

/** GET /api/oauth/account */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const purchased = Number(actor.org.balanceUsd || '0')
  const subscriptionCredits = Number(actor.org.subscriptionCreditsUsd || '0')
  const total = purchased + subscriptionCredits
  const hasCredits = total > 0
  const tier = getTier(actor.org.subscriptionTierId || 'free')
  const isPaidPlan = tier.tierId !== 'free'

  return NextResponse.json({
    user: {
      email: actor.user.email,
      privy_did: actor.user.privyDid,
    },
    organisation: {
      id: actor.org.id,
      slug: actor.org.slug,
      name: actor.org.name,
    },
    subscription: {
      plan: actor.org.subscriptionTierName || tier.name,
      tier: tier.tierOrder,
      monthly_charge: Number(tier.dollarsPerMonth),
      monthly_credits: Number(tier.monthlyCredits),
      current_period_end: actor.org.cycleEndsAt?.toISOString() ?? null,
      credits_remaining: subscriptionCredits,
      rollover_credits: 0,
    },
    paid_service_access: {
      allowed: hasCredits || isPaidPlan,
      paid_access: hasCredits || isPaidPlan,
      reason: hasCredits || isPaidPlan ? null : 'no_usable_credits',
      organisation_id: actor.org.id,
      has_active_subscription: true,
      active_subscription_is_paid: isPaidPlan,
      subscription_tier: tier.tierOrder,
      subscription_monthly_charge: Number(tier.dollarsPerMonth),
      subscription_credits_remaining: subscriptionCredits,
      purchased_credits_remaining: purchased,
      total_usable_credits: total,
    },
    tool_access: {
      enabled: false,
      coverage: {},
    },
  })
}
