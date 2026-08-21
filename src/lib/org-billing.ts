import { prisma } from './db'
import { defaultCycleEnd, getTier } from './tiers'

/** Ensure Free-tier defaults exist on an org row. */
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
  }
  if (Object.keys(patch).length === 0) return org
  return prisma.org.update({ where: { id: orgId }, data: patch })
}
