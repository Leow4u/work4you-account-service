import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveActor } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { moneyAdd } from '@/lib/tiers'

export const runtime = 'nodejs'

/**
 * GET /api/billing/charge/[id]
 * Never 404 — unknown id returns { status: "pending" }.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const { id } = await ctx.params
  const charge = await prisma.billingCharge.findFirst({
    where: { id, orgId: actor.org.id },
  })
  if (!charge) {
    return NextResponse.json({ status: 'pending' })
  }

  if (charge.status === 'pending' && charge.stripePaymentIntentId) {
    try {
      const stripe = getStripe()
      const intent = await stripe.paymentIntents.retrieve(
        charge.stripePaymentIntentId,
      )
      if (intent.status === 'succeeded') {
        await prisma.$transaction([
          prisma.billingCharge.update({
            where: { id: charge.id },
            data: { status: 'settled', reason: null },
          }),
          prisma.org.update({
            where: { id: actor.org.id },
            data: {
              balanceUsd: moneyAdd(
                actor.org.balanceUsd || '0',
                charge.amountUsd,
              ),
              lastTopupAt: new Date(),
            },
          }),
        ])
        return NextResponse.json({
          status: 'settled',
          amountUsd: charge.amountUsd,
        })
      }
      if (
        intent.status === 'requires_action' ||
        intent.status === 'requires_payment_method'
      ) {
        await prisma.billingCharge.update({
          where: { id: charge.id },
          data: {
            status: 'failed',
            reason:
              intent.status === 'requires_action'
                ? 'authentication_required'
                : 'card_declined',
          },
        })
        return NextResponse.json({
          status: 'failed',
          reason:
            intent.status === 'requires_action'
              ? 'authentication_required'
              : 'card_declined',
          portalUrl: `/orgs/${actor.org.slug}/billing`,
        })
      }
    } catch {
      // keep pending
    }
  }

  return NextResponse.json({
    status: charge.status,
    amountUsd: charge.amountUsd,
    reason: charge.reason,
    portalUrl:
      charge.status === 'failed'
        ? `/orgs/${actor.org.slug}/billing`
        : undefined,
  })
}
