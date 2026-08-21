import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, {
    apiVersion: '2025-08-27.basil',
  })
  return _stripe
}

export function portalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL ||
    process.env.OAUTH_ISSUER ||
    'https://portal.work4you.ai'
  ).replace(/\/$/, '')
}

export function publishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    ''
  )
}
