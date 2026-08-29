/**
 * Live inference catalog + tier annotation for Portal pickers.
 */
import type { Org, User } from '@prisma/client'
import { prisma } from './db'
import { signAccessToken } from './crypto'
import { buildPaidServiceAccess } from './account-entitlement'
import { getTier } from './tiers'
import {
  annotateModels,
  HOUSE_MODEL_DISPLAY,
  isHouseModel,
  OFFICIAL_WORK4YOU_MODEL_IDS,
  orgHasPaidPlan,
  pickDefaultUnlocked,
  type AnnotatedModel,
  type ModelPricing,
} from './model-access'

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

export type OrgModelCatalog = {
  paidPlan: boolean
  tierId: string
  defaultModel: string
  models: AnnotatedModel[]
}

export async function fetchAnnotatedModelsForOrg(args: {
  org: Org
  user: Pick<User, 'id' | 'privyDid'>
}): Promise<OrgModelCatalog | { error: 'catalog_unavailable'; status: number }> {
  const paidPlan = orgHasPaidPlan(args.org)
  const tierId = getTier(args.org.subscriptionTierId || 'free').tierId

  const { token } = await mintInvokeJwt({
    privyDid: args.user.privyDid,
    orgId: args.org.id,
    userId: args.user.id,
  })

  const upstream = await fetch(`${INFERENCE_BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = (await upstream.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; pricing?: ModelPricing }>
  }
  if (!upstream.ok) {
    return { error: 'catalog_unavailable', status: upstream.status }
  }

  const liveById = new Map(
    (raw.data || [])
      .filter((m) => typeof m.id === 'string' && m.id)
      .map((m) => [String(m.id), m]),
  )
  const models = annotateModels({
    paidPlan,
    models: OFFICIAL_WORK4YOU_MODEL_IDS.map((id) => {
      const live = liveById.get(id)
      return {
        id,
        name: isHouseModel(id) ? HOUSE_MODEL_DISPLAY : live?.name || id,
        pricing: live?.pricing,
      }
    }),
  })

  return {
    paidPlan,
    tierId,
    defaultModel: pickDefaultUnlocked(models),
    models,
  }
}

/** Resolve a provision-time model id: honor explicit choice if unlocked, else default. */
export function resolveProvisionModel(
  catalog: OrgModelCatalog,
  requested?: string | null,
): string {
  const want = requested?.trim()
  if (want) {
    const hit = catalog.models.find((m) => m.id === want)
    if (hit && !hit.locked) return hit.id
  }
  return catalog.defaultModel
}
