import { prisma } from './db'
import { getStripe } from './stripe'

/** Ensure Stripe Customer exists for org; return customer id. */
export async function ensureStripeCustomer(org: {
  id: string
  name: string
  slug: string
  stripeCustomerId: string | null
}, email?: string | null): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId
  const stripe = getStripe()
  const customer = await stripe.customers.create({
    name: org.name,
    email: email || undefined,
    metadata: { orgId: org.id, orgSlug: org.slug },
  })
  await prisma.org.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export async function syncCardFromCustomer(orgId: string, customerId: string) {
  const stripe = getStripe()
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return null
  const defaultPm =
    typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : null

  let pmId = defaultPm
  if (!pmId) {
    const list = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    })
    pmId = list.data[0]?.id ?? null
  }
  if (!pmId) {
    await prisma.org.update({
      where: { id: orgId },
      data: {
        stripeDefaultPmId: null,
        cardBrand: null,
        cardLast4: null,
      },
    })
    return null
  }

  const pm = await stripe.paymentMethods.retrieve(pmId)
  const brand = pm.card?.brand || 'card'
  const last4 = pm.card?.last4 || '0000'
  await prisma.org.update({
    where: { id: orgId },
    data: {
      stripeDefaultPmId: pmId,
      cardBrand: brand.charAt(0).toUpperCase() + brand.slice(1),
      cardLast4: last4,
    },
  })
  if (!defaultPm) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    })
  }
  return { brand, last4, pmId }
}
