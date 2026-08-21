import { NextRequest, NextResponse } from 'next/server'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'
import { prisma } from '@/lib/db'
import { signAccessToken } from '@/lib/crypto'
import { buildPaidServiceAccess } from '@/lib/account-entitlement'
import { getTier } from '@/lib/tiers'
import {
  annotateModels,
  orgHasPaidPlan,
  pickDefaultUnlocked,
  type ModelPricing,
} from '@/lib/model-access'

export const runtime = 'nodejs'

const INFERENCE_BASE = (
  process.env.INFERENCE_API_URL ||
  process.env.NEXT_PUBLIC_INFERENCE_API_URL ||
  'https://inference-api.work4you.ai'
).replace(/\/$/, '')

async function mintInvokeJwt(params: {
  privyDid: string
  orgId: string
  userId: string
}) {
  const org = await prisma.org.findUniqueOrThrow({ where: { id: params.orgId } })
  const access = buildPaidServiceAccess(org)
  const tier = getTier(org.subscriptionTierId || 'free')
  return signAccessToken({
    sub: params.privyDid,
    clientId: 'work4you-portal-playground',
    scope: 'inference:invoke',
    orgId: params.orgId,
    sessionId: `playground:${params.userId}`,
    paidAccess: access.allowed,
    subscriptionTier: tier.tierOrder,
    expiresInSec: 10 * 60,
  })
}

/**
 * GET /api/keys/models — catalog for playground with locked (paid) flags.
 */
export async function GET(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { user, org } = await ensureUserAndOrg(claims.userId)
  const paidPlan = orgHasPaidPlan(org)

  const { token } = await mintInvokeJwt({
    privyDid: user.privyDid,
    orgId: org.id,
    userId: user.id,
  })

  const upstream = await fetch(`${INFERENCE_BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = (await upstream.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; pricing?: ModelPricing }>
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'catalog_unavailable', status: upstream.status, upstream: raw },
      { status: 502 },
    )
  }

  const annotated = annotateModels({
    paidPlan,
    models: (raw.data || [])
      .filter((m) => typeof m.id === 'string' && m.id)
      .map((m) => ({
        id: m.id as string,
        name: m.name,
        pricing: m.pricing,
      })),
  })

  return NextResponse.json({
    paidPlan,
    tierId: getTier(org.subscriptionTierId || 'free').tierId,
    defaultModel: pickDefaultUnlocked(annotated),
    models: annotated,
  })
}
