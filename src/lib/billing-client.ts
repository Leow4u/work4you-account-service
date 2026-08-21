/** Client-safe billing types + display helpers (no server imports). */

export type BillingStatePayload = {
  org: { id: string; slug: string; name: string; role: string }
  balanceUsd: string
  cliBillingEnabled: boolean
  canChangePlan: boolean
  chargePresets: string[]
  bounds: { minUsd: string; maxUsd: string }
  card: { brand: string; last4: string; resolvedVia?: string } | null
  paymentMethod: {
    kind: 'card' | 'link' | 'unknown'
    brand?: string
    last4?: string
    resolvedVia?: string
  } | null
  monthlyCap: {
    limitUsd: string
    spentThisMonthUsd: string
    isDefaultCeiling: boolean
  }
  autoReload: {
    enabled: boolean
    thresholdUsd: string | null
    reloadToUsd: string | null
    card: { kind: 'canonical' | 'distinct' | 'none' }
  }
  portalUrl: string
}

export function formatUsdDisplay(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return `$${raw}`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}
