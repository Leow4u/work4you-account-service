import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  canChangePlan,
  hasBillingManageScope,
  resolveActor,
} from '@/lib/auth'
import { moneyAdd } from '@/lib/tiers'
import { getStripe } from '@/lib/stripe'
import { ensureStripeCustomer, syncCardFromCustomer } from '@/lib/stripe-customer'

export const runtime = 'nodejs'

/**
 * POST /api/billing/charge
 * Body: { amountUsd: number }
 * Header: Idempotency-Key (required)
 * Returns 202 { chargeId }
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
        portalUrl: `/orgs/${actor.org.slug}/billing?topup=open`,
      },
      { status: 403 },
    )
  }
  if (!canChangePlan(actor)) {
    return NextResponse.json(
      { error: 'role_required', portalUrl: `/orgs/${actor.org.slug}/billing` },
      { status: 403 },
    )
  }
  if (!actor.org.cliBillingEnabled && actor.via === 'oauth') {
    return NextResponse.json(
      {
        error: 'cli_billing_disabled',
        code: 'remote_spending_disabled',
        portalUrl: `/orgs/${actor.org.slug}/billing`,
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

  const body = (await req.json()) as { amountUsd?: number | string }
  const amount = Number(body.amountUsd)
  if (!Number.isFinite(amount) || amount < 5 || amount > 500) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }
  const amountUsd = amount.toFixed(2).replace(/\.00$/, '')

  const existing = await prisma.billingCharge.findUnique({
    where: {
      orgId_idempotencyKey: { orgId: actor.org.id, idempotencyKey },
    },
  })
  if (existing) {
    if (existing.amountUsd !== amountUsd && existing.amountUsd !== amount.toFixed(2)) {
      return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 })
    }
    return NextResponse.json({ chargeId: existing.id }, { status: 202 })
  }

  try {
    const customerId = await ensureStripeCustomer(actor.org, actor.user.email)
    await syncCardFromCustomer(actor.org.id, customerId)
    const org = await prisma.org.findUniqueOrThrow({ where: { id: actor.org.id } })
    if (!org.stripeDefaultPmId) {
      return NextResponse.json(
        {
          error: 'no_payment_method',
          portalUrl: `/orgs/${org.slug}/billing`,
        },
        { status: 403 },
      )
    }

    const stripe = getStripe()
    const cents = Math.round(amount * 100)
    const intent = await stripe.paymentIntents.create(
      {
        amount: cents,
        currency: 'usd',
        customer: customerId,
        payment_method: org.stripeDefaultPmId,
        confirm: true,
        off_session: true,
        metadata: { orgId: org.id, purpose: 'topup' },
      },
      { idempotencyKey },
    )

    const settled = intent.status === 'succeeded'
    const needsAction = intent.status === 'requires_action'
    const charge = await prisma.billingCharge.create({
      data: {
        orgId: org.id,
        amountUsd: amount.toFixed(2),
        status: settled ? 'settled' : needsAction ? 'failed' : intent.status === 'processing' ? 'pending' : 'failed',
        reason: needsAction
          ? 'authentication_required'
          : settled
            ? null
            : intent.status,
        idempotencyKey,
        stripePaymentIntentId: intent.id,
      },
    })

    if (settled) {
      await prisma.org.update({
        where: { id: org.id },
        data: {
          balanceUsd: moneyAdd(org.balanceUsd || '0', amount.toFixed(2)),
          lastTopupAt: new Date(),
        },
      })
    }

    return NextResponse.json({ chargeId: charge.id }, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stripe_error'
    // Card errors from Stripe
    if (message.includes('card') || message.includes('declined')) {
      const charge = await prisma.billingCharge.create({
        data: {
          orgId: actor.org.id,
          amountUsd: amount.toFixed(2),
          status: 'failed',
          reason: 'card_declined',
          idempotencyKey,
        },
      })
      return NextResponse.json({ chargeId: charge.id }, { status: 202 })
    }
    return NextResponse.json(
      { error: 'stripe_unavailable', message },
      { status: 503 },
    )
  }
}
