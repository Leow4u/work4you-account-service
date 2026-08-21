import { NextRequest, NextResponse } from 'next/server'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'
import { prisma } from '@/lib/db'
import { signAccessToken } from '@/lib/crypto'
import { buildPaidServiceAccess } from '@/lib/account-entitlement'
import { getTier } from '@/lib/tiers'
import {
  isModelFreeForPlan,
  orgHasPaidPlan,
  type ModelPricing,
} from '@/lib/model-access'
import { recordApiKeySpend, touchApiKeyUsed } from '@/lib/api-keys'

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

function costFromUsage(usage: Record<string, unknown> | null): string {
  if (!usage) return '0'
  const direct = usage.cost
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
    return String(direct)
  }
  if (typeof direct === 'string') {
    const n = Number(direct)
    if (Number.isFinite(n) && n > 0) return String(n)
  }
  return '0'
}

/**
 * POST /api/keys/playground
 * Body: { keyId, mode: 'chat'|'completion', body: <OpenAI request> }
 * Proxies to inference with a short-lived invoke JWT; attributes spend to keyId.
 */
export async function POST(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { user, org } = await ensureUserAndOrg(claims.userId)
  const payload = (await req.json().catch(() => ({}))) as {
    keyId?: string
    mode?: string
    body?: Record<string, unknown>
  }

  const keyId = payload.keyId?.trim()
  if (!keyId) {
    return NextResponse.json({ error: 'key_required' }, { status: 400 })
  }
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, orgId: org.id, revokedAt: null },
  })
  if (!key) {
    return NextResponse.json({ error: 'key_not_found' }, { status: 404 })
  }

  const mode = payload.mode === 'completion' ? 'completion' : 'chat'
  const body = payload.body && typeof payload.body === 'object' ? payload.body : {}
  const model = typeof body.model === 'string' ? body.model : ''
  if (!model) {
    return NextResponse.json({ error: 'model_required' }, { status: 400 })
  }

  if (!orgHasPaidPlan(org)) {
    // Soft check via :free suffix; pricing refined after catalog if needed
    let pricing: ModelPricing | null = null
    try {
      const { token } = await mintInvokeJwt({
        privyDid: user.privyDid,
        orgId: org.id,
        userId: user.id,
      })
      const cat = await fetch(`${INFERENCE_BASE}/v1/models`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (cat.ok) {
        const json = (await cat.json()) as {
          data?: Array<{ id?: string; pricing?: ModelPricing }>
        }
        const hit = (json.data || []).find((m) => m.id === model)
        pricing = hit?.pricing || null
      }
    } catch {
      /* fall through to suffix check */
    }
    if (!isModelFreeForPlan(model, pricing)) {
      return NextResponse.json(
        {
          error: {
            message: 'Modelo disponível apenas em planos pagos.',
            type: 'forbidden',
            code: 'paid_plan_required',
          },
        },
        { status: 403 },
      )
    }
  }

  const { token } = await mintInvokeJwt({
    privyDid: user.privyDid,
    orgId: org.id,
    userId: user.id,
  })

  const path =
    mode === 'completion' ? '/v1/completions' : '/v1/chat/completions'
  const upstream = await fetch(`${INFERENCE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = null
  }

  if (upstream.ok) {
    const usage =
      json && typeof json.usage === 'object' && json.usage
        ? (json.usage as Record<string, unknown>)
        : null
    const amount = costFromUsage(usage)
    if (amount !== '0') {
      await recordApiKeySpend({ keyId: key.id, amountUsd: amount })
    } else {
      await touchApiKeyUsed(key.id)
    }
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
    },
  })
}
