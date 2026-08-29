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

export type SubscriptionCurrent = {
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

export type SubscriptionStatePayload = {
  org: { id: string; name: string; role: string }
  orgName: string
  orgId: string
  role: string
  canChangePlan: boolean
  context: string
  /** null = Free (no paid plan). */
  current: SubscriptionCurrent | null
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

/**
 * True only when the Portal plan is positively Free. Unknown stays false so
 * paid dollar surfaces remain visible. NAS Free is `current: null` plus
 * `subscriptionTierId === 'free'` / `planName === 'Free'`.
 */
export function isFreePlanPayload(
  billing?: Pick<BillingStatePayload, 'planName' | 'subscriptionTierId'> | null,
  subscription?: Pick<SubscriptionStatePayload, 'current'> | null,
): boolean {
  const current = subscription?.current
  if (current?.tierId && current.tierId !== 'free') return false
  const plan = (current?.tierName || billing?.planName || '').trim().toLowerCase()
  if (plan && plan !== 'free') return false
  if (current?.tierId === 'free' || plan === 'free') return true
  if (billing?.subscriptionTierId && billing.subscriptionTierId !== 'free') {
    return false
  }
  if (billing?.subscriptionTierId === 'free') return true
  return subscription != null && current == null
}

/** Boolean only — never print the hidden Free grant in dollars. */
export function freeAllowanceUsedUp(balanceUsd?: string | null): boolean {
  const n = Number(balanceUsd)
  return Number.isFinite(n) && n <= 0
}

export function isFreeCatalogTier(tier: {
  tierId?: string
  name?: string
}): boolean {
  if ((tier.name || '').trim().toLowerCase() === 'free') return true
  return (tier.tierId || '').trim().toLowerCase() === 'free'
}

/** Paid tiles keep price + included credits. Free never names the grant. */
export function catalogTierCopy(tier: {
  tierId: string
  name: string
  dollarsPerMonthDisplay: string
  monthlyCredits: string
}): { bonus: string | null; title: string } {
  if (isFreeCatalogTier(tier)) {
    return { bonus: 'Allowance mensal', title: tier.name }
  }
  return {
    bonus: `${formatUsdDisplay(tier.monthlyCredits)} créditos mensais`,
    title: `${tier.name} (${formatUsdDisplay(tier.dollarsPerMonthDisplay)}/mês)`,
  }
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
