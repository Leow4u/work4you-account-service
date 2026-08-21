/** Catalog + money helpers for Work4You Portal billing (NAS). */

export type TierId = 'free' | 'plus' | 'super' | 'ultra'

export type TierDef = {
  tierId: TierId
  name: string
  tierOrder: number
  dollarsPerMonth: string
  monthlyCredits: string
  /** Stripe Price id env override key (optional until prices exist). */
  envPriceKey?: string
}

/** Live catalog mirrored from fork desktop/TUI fixtures. */
export const TIER_CATALOG: TierDef[] = [
  {
    tierId: 'free',
    name: 'Free',
    tierOrder: 0,
    dollarsPerMonth: '0',
    monthlyCredits: '0.10',
  },
  {
    tierId: 'plus',
    name: 'Plus',
    tierOrder: 1,
    dollarsPerMonth: '20',
    monthlyCredits: '22',
    envPriceKey: 'STRIPE_PRICE_PLUS',
  },
  {
    tierId: 'super',
    name: 'Super',
    tierOrder: 2,
    dollarsPerMonth: '100',
    monthlyCredits: '110',
    envPriceKey: 'STRIPE_PRICE_SUPER',
  },
  {
    tierId: 'ultra',
    name: 'Ultra',
    tierOrder: 3,
    dollarsPerMonth: '200',
    monthlyCredits: '220',
    envPriceKey: 'STRIPE_PRICE_ULTRA',
  },
]

export function getTier(id: string): TierDef {
  return TIER_CATALOG.find((t) => t.tierId === id) || TIER_CATALOG[0]
}

export function isPaidTierId(id: string): id is Exclude<TierId, 'free'> {
  return id === 'plus' || id === 'super' || id === 'ultra'
}

/** Resolve Stripe Price id for a paid tier (env-backed). */
export function stripePriceId(tierId: string): string {
  const tier = getTier(tierId)
  if (!tier.envPriceKey) {
    throw new Error(`tier_${tierId}_has_no_stripe_price`)
  }
  const id = process.env[tier.envPriceKey]?.trim()
  if (!id) {
    throw new Error(`${tier.envPriceKey} is not set`)
  }
  return id
}

export function tierIdFromPriceId(priceId: string): TierId | null {
  for (const t of TIER_CATALOG) {
    if (!t.envPriceKey) continue
    if (process.env[t.envPriceKey]?.trim() === priceId) return t.tierId
  }
  return null
}

/** Trim trailing zeros but keep at least 2 fractional digits for display money. */
function trimMoney(s: string, minFrac = 2): string {
  if (!s.includes('.')) return s
  const [i, f = ''] = s.split('.')
  const frac = f.replace(/0+$/, '')
  if (frac.length >= minFrac) return `${i}.${frac}`
  return `${i}.${f.slice(0, minFrac).padEnd(minFrac, '0')}`.replace(/\.$/, '')
}

/**
 * Decimal-string add.
 * Default 2dp (Stripe top-ups / plan dollars). Pass `dp=6` for inference meter
 * (Hermes-style sub-cent spend).
 */
export function moneyAdd(a: string, b: string, dp = 2): string {
  return trimMoney((Number(a || 0) + Number(b || 0)).toFixed(dp), Math.min(2, dp))
}

export function moneySub(a: string, b: string, dp = 2): string {
  return trimMoney(
    Math.max(0, Number(a || 0) - Number(b || 0)).toFixed(dp),
    Math.min(2, dp),
  )
}

export function moneyCmp(a: string, b: string): number {
  return Number(a || 0) - Number(b || 0)
}

export function totalSpendable(subscriptionUsd: string, purchasedUsd: string): string {
  return moneyAdd(subscriptionUsd || '0', purchasedUsd || '0')
}

export function defaultCycleEnd(from = new Date()): Date {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + 30)
  return d
}
