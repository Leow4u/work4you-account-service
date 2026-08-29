import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildPaidServiceAccess, orgHasUsableCredits } from '@/lib/account-entitlement'
import { ensureBillingDefaults } from '@/lib/org-billing'
import { getTier, TIER_RATE_LIMITS } from '@/lib/tiers'
import { orgHasPaidPlan } from '@/lib/model-access'

export const runtime = 'nodejs'

function assertInferenceAuth(req: NextRequest): boolean {
  const secret = process.env.INFERENCE_BILLING_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const key = req.headers.get('x-work4you-billing-key') || ''
  return key === secret
}

/**
 * POST /api/internal/billing/authorize
 * Pre-flight for inference: { orgId } → allowed + paid_service_access + plan gate.
 * 402 when no usable credits (same signal as a billing wall).
 */
export async function POST(req: NextRequest) {
  if (!assertInferenceAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { orgId?: string }
  const orgId = body.orgId?.trim()
  if (!orgId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const existing = await prisma.org.findUnique({ where: { id: orgId } })
  if (!existing) {
    return NextResponse.json({ error: 'org_not_found' }, { status: 404 })
  }

  // Roll a due Free cycle before the credit wall so next-month access
  // does not wait on a Portal page load.
  const org = await ensureBillingDefaults(orgId)
  const access = buildPaidServiceAccess(org)
  const tier = getTier(org.subscriptionTierId || 'free')
  const paidPlan = orgHasPaidPlan(org)
  const rateLimit = TIER_RATE_LIMITS[tier.tierId] || TIER_RATE_LIMITS.free

  if (!orgHasUsableCredits(org)) {
    return NextResponse.json(
      {
        allowed: false,
        error: 'no_usable_credits',
        reason: 'no_usable_credits',
        message: 'Account has no usable credits',
        paid_service_access: access,
        paid_plan: paidPlan,
        tier_id: tier.tierId,
        subscription_tier: tier.tierOrder,
        rate_limit: rateLimit,
      },
      { status: 402 },
    )
  }

  return NextResponse.json({
    allowed: true,
    paid_service_access: access,
    paid_plan: paidPlan,
    tier_id: tier.tierId,
    subscription_tier: tier.tierOrder,
    rate_limit: rateLimit,
  })
}
