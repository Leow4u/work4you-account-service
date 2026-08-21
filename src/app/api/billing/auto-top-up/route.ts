import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  canChangePlan,
  hasBillingManageScope,
  resolveActor,
} from '@/lib/auth'
import { buildBillingState } from '@/lib/billing'

export const runtime = 'nodejs'

/** PATCH /api/billing/auto-top-up */
export async function PATCH(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  if (!hasBillingManageScope(actor) && actor.via === 'oauth') {
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })
  }
  if (!canChangePlan(actor)) {
    return NextResponse.json({ error: 'role_required' }, { status: 403 })
  }

  const body = (await req.json()) as {
    enabled?: boolean
    threshold?: number | string
    topUpAmount?: number | string
  }

  const enabled = Boolean(body.enabled)
  const threshold = body.threshold != null ? String(body.threshold) : null
  const topUpAmount = body.topUpAmount != null ? String(body.topUpAmount) : null

  if (enabled && (!threshold || !topUpAmount)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  await prisma.org.update({
    where: { id: actor.org.id },
    data: {
      autoReloadEnabled: enabled,
      autoReloadThresholdUsd: enabled ? threshold : null,
      autoReloadAmountUsd: enabled ? topUpAmount : null,
    },
  })

  const refreshed = await resolveActor(req.headers.get('authorization'))
  return NextResponse.json(
    refreshed ? buildBillingState(refreshed) : { ok: true },
  )
}
