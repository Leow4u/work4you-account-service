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

/** Decimal-string add (2dp). */
export function moneyAdd(a: string, b: string): string {
  return (Number(a || 0) + Number(b || 0)).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function moneySub(a: string, b: string): string {
  return Math.max(0, Number(a || 0) - Number(b || 0))
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')
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
