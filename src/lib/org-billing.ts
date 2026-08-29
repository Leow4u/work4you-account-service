import { prisma } from './db'
import {
  defaultCycleEnd,
  getTier,
  shouldRolloverFreeCycle,
  shouldUpgradeLegacyFreeGrant,
} from './tiers'

/** Ensure Free-tier defaults exist on an org row, then roll the Free cycle if due. */
export async function ensureBillingDefaults(orgId: string) {
  const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } })
  const patch: Record<string, unknown> = {}
  if (!org.subscriptionTierId) patch.subscriptionTierId = 'free'
  if (!org.subscriptionTierName) patch.subscriptionTierName = 'Free'
  if (!org.cycleEndsAt) patch.cycleEndsAt = defaultCycleEnd()
  if (
    org.subscriptionCreditsUsd == null ||
    org.subscriptionCreditsUsd === ''
  ) {
    patch.subscriptionCreditsUsd = getTier('free').monthlyCredits
  } else if (
    shouldUpgradeLegacyFreeGrant({
      tierId: org.subscriptionTierId || 'free',
      creditsUsd: org.subscriptionCreditsUsd,
      spentThisPeriodUsd: org.spentThisPeriodUsd,
    })
  ) {
    patch.subscriptionCreditsUsd = getTier('free').monthlyCredits
  }
  const next =
    Object.keys(patch).length === 0
      ? org
      : await prisma.org.update({ where: { id: orgId }, data: patch })
  return rolloverFreeCycleIfNeeded(orgId, next)
}

/**
 * Same gesture as the Stripe `subscription_cycle` webhook, for Free.
 * Paid plans refill from Stripe; Free has no invoice, so authorize/org
 * load advances `cycleEndsAt` and resets the hidden monthly grant.
 */
export async function rolloverFreeCycleIfNeeded(
  orgId: string,
  org?: Awaited<ReturnType<typeof prisma.org.findUniqueOrThrow>>,
) {
  const row = org ?? (await prisma.org.findUniqueOrThrow({ where: { id: orgId } }))
  if (
    !shouldRolloverFreeCycle(
      row.subscriptionTierId || 'free',
      row.cycleEndsAt,
    )
  ) {
    return row
  }
  const tier = getTier('free')
  return prisma.org.update({
    where: { id: orgId },
    data: {
      subscriptionCreditsUsd: tier.monthlyCredits,
      spentThisPeriodUsd: '0',
      cycleEndsAt: defaultCycleEnd(),
    },
  })
}
