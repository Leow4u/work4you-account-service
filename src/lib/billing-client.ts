/** Client-safe billing types + display helpers (no server imports). */

export type BillingStatePayload = {
  org: { id: string; slug: string; name: string; role: string }
  /** Total spendable = subscription + purchased. */
  balanceUsd: string
  purchasedCreditsUsd: string
  subscriptionCreditsUsd: string
  spentThisPeriodUsd: string
  lastTopupAt: string | null
  cycleEndsAt: string | null
  planName: string
  subscriptionTierId: string
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

export type SubscriptionStatePayload = {
  orgName: string
  orgId: string
  role: string
  canChangePlan: boolean
  context: string
  current: {
    tierId: string
    tierName: string
    monthlyCredits: string
    creditsRemaining: string
    cycleEndsAt: string | null
    pendingDowngradeTierName: string | null
    pendingDowngradeAt: string | null
    cancelAtPeriodEnd: boolean
    cancellationEffectiveAt: string | null
  }
  tiers: Array<{
    tierId: string
    name: string
    tierOrder: number
    dollarsPerMonthDisplay: string
    monthlyCredits: string
    isCurrent: boolean
    isEnabled: boolean
  }>
  portalUrl: string
}

export function formatUsdDisplay(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return `$${raw}`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}

export function formatCycleDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}
