import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/oauth/account
 * Fresh entitlement snapshot for the CLI (`work4you_account.py`).
 * Auth: Bearer Work4You OAuth JWT (or Privy for Portal).
 */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json(
      { error: 'invalid_token' },
      { status: 401 },
    )
  }

  const balance = Number(actor.org.balanceUsd || '0')
  const purchased = Number.isFinite(balance) ? balance : 0
  const hasCredits = purchased > 0

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
    subscription: null,
    paid_service_access: {
      allowed: hasCredits,
      paid_access: hasCredits,
      reason: hasCredits ? null : 'no_usable_credits',
      organisation_id: actor.org.id,
      has_active_subscription: false,
      active_subscription_is_paid: false,
      subscription_tier: null,
      subscription_monthly_charge: null,
      subscription_credits_remaining: 0,
      purchased_credits_remaining: purchased,
      total_usable_credits: purchased,
    },
    tool_access: {
      enabled: false,
      coverage: {},
    },
  })
}
