import { NextRequest, NextResponse } from 'next/server'
import {
  canChangePlan,
  hasBillingManageScope,
  resolveActor,
} from '@/lib/auth'
import { previewSubscriptionChange } from '@/lib/subscription-ops'

export const runtime = 'nodejs'

/**
 * POST /api/billing/subscription/preview
 * Body: { subscriptionTypeId: string }
 * Requires billing:manage (OAuth) + canChangePlan.
 */
export async function POST(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  if (!hasBillingManageScope(actor) && actor.via === 'oauth') {
    return NextResponse.json(
      {
        error: 'insufficient_scope',
        portalUrl: `/manage-subscription?org_id=${actor.org.id}`,
      },
      { status: 403 },
    )
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
  }
  const subscriptionTypeId = body.subscriptionTypeId?.trim()
  if (!subscriptionTypeId) {
    return NextResponse.json(
      { error: 'invalid_subscription_type' },
      { status: 400 },
    )
  }

  try {
    const preview = await previewSubscriptionChange(actor.org, subscriptionTypeId)
    return NextResponse.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
