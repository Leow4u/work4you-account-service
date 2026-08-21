import type { Actor } from './auth'
import { canChangePlan } from './auth'
import type { BillingStatePayload } from './billing-client'
import { getTier, totalSpendable, TIER_CATALOG } from './tiers'

export type { BillingStatePayload } from './billing-client'
export { formatUsdDisplay } from './billing-client'

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
  const purchased = org.balanceUsd || '0'
  const subscription = org.subscriptionCreditsUsd || '0'
  const spent = org.spentThisPeriodUsd || '0'
  const total = totalSpendable(subscription, purchased)
  const tier = getTier(org.subscriptionTierId || 'free')

  return {
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      role,
    },
    balanceUsd: total,
    purchasedCreditsUsd: purchased,
    subscriptionCreditsUsd: subscription,
    spentThisPeriodUsd: spent,
    lastTopupAt: org.lastTopupAt?.toISOString() ?? null,
    cycleEndsAt: org.cycleEndsAt?.toISOString() ?? null,
    planName: org.subscriptionTierName || tier.name,
    subscriptionTierId: org.subscriptionTierId || 'free',
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

export function buildSubscriptionState(actor: Actor) {
  const { org, role } = actor
  const tierId = (org.subscriptionTierId || 'free') as string
  const currentTier = getTier(tierId)
  const current = {
    tierId: currentTier.tierId,
    tierName: org.subscriptionTierName || currentTier.name,
    monthlyCredits: currentTier.monthlyCredits,
    creditsRemaining: org.subscriptionCreditsUsd || '0',
    cycleEndsAt: org.cycleEndsAt?.toISOString() ?? null,
    pendingDowngradeTierName: null as string | null,
    pendingDowngradeAt: null as string | null,
    cancelAtPeriodEnd: false,
    cancellationEffectiveAt: null as string | null,
  }

  return {
    orgName: org.name,
    orgId: org.id,
    role,
    canChangePlan: canChangePlan(actor),
    context: org.personal ? 'personal' : 'team',
    current,
    tiers: TIER_CATALOG.filter((t) => t.tierId !== 'free').map((t) => ({
      tierId: t.tierId,
      name: t.name,
      tierOrder: t.tierOrder,
      dollarsPerMonthDisplay: t.dollarsPerMonth,
      monthlyCredits: t.monthlyCredits,
      isCurrent: t.tierId === tierId,
      isEnabled: true,
    })),
    portalUrl: `/orgs/${encodeURIComponent(org.slug)}/billing`,
  }
}
