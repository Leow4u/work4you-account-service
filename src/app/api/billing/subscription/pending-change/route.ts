import { NextRequest, NextResponse } from 'next/server'
import {
  canChangePlan,
  hasBillingManageScope,
  resolveActor,
} from '@/lib/auth'
import {
  clearPendingChange,
  schedulePendingChange,
} from '@/lib/subscription-ops'

export const runtime = 'nodejs'

function scopeGate(actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>) {
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
  return null
}

/**
 * PUT /api/billing/subscription/pending-change
 * Body: { type: "cancellation" } | { type: "tier_change", subscriptionTypeId }
 */
export async function PUT(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const denied = scopeGate(actor)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as {
    type?: string
    subscriptionTypeId?: string
  }

  try {
    if (body.type === 'cancellation') {
      const result = await schedulePendingChange(actor.org, { type: 'cancellation' })
      return NextResponse.json(result)
    }
    if (body.type === 'tier_change') {
      const id = body.subscriptionTypeId?.trim()
      if (!id) {
        return NextResponse.json(
          { error: 'invalid_subscription_type' },
          { status: 400 },
        )
      }
      const result = await schedulePendingChange(actor.org, {
        type: 'tier_change',
        subscriptionTypeId: id,
      })
      return NextResponse.json(result)
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'upgrade_not_allowed_here') {
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: 'Upgrades must use POST /api/billing/subscription/upgrade',
        },
        { status: 400 },
      )
    }
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}

/** DELETE /api/billing/subscription/pending-change */
export async function DELETE(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const denied = scopeGate(actor)
  if (denied) return denied

  try {
    const result = await clearPendingChange(actor.org)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
