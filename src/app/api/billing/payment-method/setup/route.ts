import { NextRequest, NextResponse } from 'next/server'
import { canChangePlan, resolveActor } from '@/lib/auth'
import { ensureStripeCustomer } from '@/lib/stripe-customer'
import { getStripe, portalBaseUrl } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * POST /api/billing/payment-method/setup
 * Creates a Stripe Checkout Session (mode=setup) to save a reusable card.
 * Body optional: { returnPath?: string }
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
        portalUrl: `/orgs/${actor.org.slug}/billing`,
      },
      { status: 403 },
    )
  }

  let returnPath = `/orgs/${actor.org.slug}/billing?card=saved`
  try {
    const body = (await req.json()) as { returnPath?: string }
    if (typeof body?.returnPath === 'string' && body.returnPath.startsWith('/')) {
      returnPath = body.returnPath
    }
  } catch {
    // empty body ok
  }

  try {
    const customerId = await ensureStripeCustomer(actor.org, actor.user.email)
    const stripe = getStripe()
    const base = portalBaseUrl()
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${base}${returnPath}`,
      cancel_url: `${base}/orgs/${actor.org.slug}/billing`,
      metadata: { orgId: actor.org.id, purpose: 'save_card' },
    })
    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
