import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { debitOrgCredits } from '@/lib/billing-debit'
import { buildPaidServiceAccess } from '@/lib/account-entitlement'
import {
  metersHaveTokens,
  normalizeUsageMeters,
} from '@/lib/usage-meters'

export const runtime = 'nodejs'

/**
 * Internal auth for inference-api → NAS debit.
 * Header: Authorization: Bearer $INFERENCE_BILLING_SECRET
 *      or: X-Work4You-Billing-Key: $INFERENCE_BILLING_SECRET
 */
function assertInferenceAuth(req: NextRequest): boolean {
  const secret = process.env.INFERENCE_BILLING_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const key = req.headers.get('x-work4you-billing-key') || ''
  return key === secret
}

/**
 * POST /api/internal/billing/debit
 * Body: {
 *   orgId, amountUsd, idempotencyKey, purpose?,
 *   inputTokens?, outputTokens?, cacheReadTokens?, cacheWriteTokens?,
 *   apiKeyId?
 * }
 *
 * amountUsd may be 0 when token meters are present (free / zero-cost settle).
 * On success: 200 settled/replay.
 * On empty balance (paid amount): 402 { error: "no_usable_credits", ... }.
 */
export async function POST(req: NextRequest) {
  if (!assertInferenceAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    orgId?: string
    amountUsd?: number | string
    idempotencyKey?: string
    purpose?: string
    apiKeyId?: string
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }

  const orgId = body.orgId?.trim()
  const idempotencyKey = body.idempotencyKey?.trim()
  const apiKeyId = body.apiKeyId?.trim() || null
  const amount = Number(body.amountUsd)
  const meters = normalizeUsageMeters({
    inputTokens: body.inputTokens,
    outputTokens: body.outputTokens,
    cacheReadTokens: body.cacheReadTokens,
    cacheWriteTokens: body.cacheWriteTokens,
  })

  if (
    !orgId ||
    !idempotencyKey ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    (amount === 0 && !metersHaveTokens(meters))
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const org = await prisma.org.findUnique({ where: { id: orgId } })
  if (!org) {
    return NextResponse.json({ error: 'org_not_found' }, { status: 404 })
  }

  try {
    const result = await debitOrgCredits({
      org,
      amountUsd: amount,
      idempotencyKey,
      purpose: body.purpose,
      meters,
    })

    if (result.status === 'insufficient') {
      const fresh = await prisma.org.findUniqueOrThrow({ where: { id: orgId } })
      return NextResponse.json(
        {
          error: 'no_usable_credits',
          status: 'insufficient',
          reason: 'no_usable_credits',
          message: 'Account has no usable credits',
          amountUsd: result.amountUsd,
          totalUsableCredits: result.totalUsableCredits,
          paid_service_access: buildPaidServiceAccess(fresh),
        },
        { status: 402 },
      )
    }

    if (apiKeyId && result.status === 'settled' && amount > 0) {
      const { recordApiKeySpend } = await import('@/lib/api-keys')
      await recordApiKeySpend({
        keyId: apiKeyId,
        amountUsd: result.amountUsd,
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'debit_failed'
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 })
  }
}
