import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { syncCardFromCustomer } from '@/lib/stripe-customer'

export const runtime = 'nodejs'

/**
 * POST /api/billing/webhook — Stripe webhooks.
 * Handles setup checkout completion (save card).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const stripe = getStripe()
  const raw = await req.text()
  const sig = req.headers.get('stripe-signature') || ''

  let event
  try {
    if (secret) {
      event = stripe.webhooks.constructEvent(raw, sig, secret)
    } else {
      event = JSON.parse(raw)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_payload'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      mode?: string
      customer?: string
      metadata?: { orgId?: string; purpose?: string }
      setup_intent?: string
    }
    if (
      session.mode === 'setup' &&
      session.metadata?.orgId &&
      session.customer
    ) {
      const orgId = session.metadata.orgId
      const customerId =
        typeof session.customer === 'string' ? session.customer : ''
      await prisma.org.update({
        where: { id: orgId },
        data: { stripeCustomerId: customerId },
      })
      if (session.setup_intent) {
        try {
          const si = await stripe.setupIntents.retrieve(
            String(session.setup_intent),
          )
          if (typeof si.payment_method === 'string') {
            await stripe.customers.update(customerId, {
              invoice_settings: {
                default_payment_method: si.payment_method,
              },
            })
          }
        } catch {
          // sync from list below
        }
      }
      await syncCardFromCustomer(orgId, customerId)
    }
  }

  return NextResponse.json({ received: true })
}
