import { NextRequest, NextResponse } from 'next/server'
import { canChangePlan, resolveActor } from '@/lib/auth'
import { ensureStripeCustomer } from '@/lib/stripe-customer'
import { createSubscriptionCheckout } from '@/lib/subscription-ops'
import { isPaidTierId } from '@/lib/tiers'

export const runtime = 'nodejs'

/**
 * POST /api/billing/subscription/checkout
 * Portal Free→paid (and SCA recovery): Stripe Checkout mode=subscription.
 * Body: { subscriptionTypeId: string, returnPath?: string }
 */
export async function POST(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  if (!canChangePlan(actor)) {
    return NextResponse.json(
      {
        error: 'role_required',
        portalUrl: `/manage-subscription?org_id=${actor.org.id}`,
      },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    subscriptionTypeId?: string
    returnPath?: string
  }
  const subscriptionTypeId = body.subscriptionTypeId?.trim()
  if (!subscriptionTypeId || !isPaidTierId(subscriptionTypeId)) {
    return NextResponse.json(
      { error: 'invalid_subscription_type' },
      { status: 400 },
    )
  }

  try {
    const customerId = await ensureStripeCustomer(actor.org, actor.user.email)
    const session = await createSubscriptionCheckout(
      actor.org,
      subscriptionTypeId,
      customerId,
      typeof body.returnPath === 'string' ? body.returnPath : undefined,
    )
    return NextResponse.json(session)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
