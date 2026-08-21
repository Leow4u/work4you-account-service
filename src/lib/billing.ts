import type { Actor } from './auth'
import { canChangePlan } from './auth'
import type { BillingStatePayload } from './billing-client'

export type { BillingStatePayload } from './billing-client'
export { formatUsdDisplay } from './billing-client'

/** Default charge presets (USD decimal strings) — matches CLI fixtures. */
export const DEFAULT_CHARGE_PRESETS = ['10', '25', '50'] as const
export const DEFAULT_BOUNDS = { minUsd: '5', maxUsd: '500' } as const
export const DEFAULT_MONTHLY_CAP_USD = '500'

export function buildBillingState(actor: Actor): BillingStatePayload {
  const { org, role } = actor
  const hasCard = Boolean(org.cardBrand && org.cardLast4)
  const card = hasCard
    ? {
        brand: org.cardBrand as string,
        last4: org.cardLast4 as string,
        resolvedVia: 'customerDefault' as const,
      }
    : null

  const paymentMethod = card
    ? {
        kind: 'card' as const,
        brand: card.brand,
        last4: card.last4,
        resolvedVia: card.resolvedVia,
      }
    : null

  const isDefaultCeiling = !org.monthlyCapUsd
  const limitUsd = org.monthlyCapUsd || DEFAULT_MONTHLY_CAP_USD

  return {
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      role,
    },
    balanceUsd: org.balanceUsd || '0',
    cliBillingEnabled: org.cliBillingEnabled,
    canChangePlan: canChangePlan(actor),
    chargePresets: [...DEFAULT_CHARGE_PRESETS],
    bounds: { ...DEFAULT_BOUNDS },
    card,
    paymentMethod,
    monthlyCap: {
      limitUsd,
      spentThisMonthUsd: org.monthlySpentUsd || '0',
      isDefaultCeiling,
    },
    autoReload: {
      enabled: org.autoReloadEnabled,
      thresholdUsd: org.autoReloadThresholdUsd,
      reloadToUsd: org.autoReloadAmountUsd,
      card: { kind: hasCard && org.autoReloadEnabled ? 'canonical' : 'none' },
    },
    portalUrl: `/orgs/${encodeURIComponent(org.slug)}/billing?topup=open`,
  }
}
