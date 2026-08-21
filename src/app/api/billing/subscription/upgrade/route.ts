import { NextRequest, NextResponse } from 'next/server'
import {
  canChangePlan,
  hasBillingManageScope,
  resolveActor,
} from '@/lib/auth'
import { upgradeSubscription } from '@/lib/subscription-ops'

export const runtime = 'nodejs'

/**
 * POST /api/billing/subscription/upgrade
 * Body: { subscriptionTypeId: string }
 * Header: Idempotency-Key (required)
 * The single money route for paid→paid upgrades (fork V3).
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
  if (!actor.org.cliBillingEnabled && actor.via === 'oauth') {
    return NextResponse.json(
      {
        error: 'cli_billing_disabled',
        code: 'remote_spending_disabled',
        portalUrl: `/manage-subscription?org_id=${actor.org.id}`,
      },
      { status: 403 },
    )
  }

  const idempotencyKey = req.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'idempotency_key_required' },
      { status: 400 },
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
    const result = await upgradeSubscription(
      actor.org,
      subscriptionTypeId,
      idempotencyKey,
    )
    // Always 200 — fork client maps status (upgraded|requires_action|payment_failed).
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
