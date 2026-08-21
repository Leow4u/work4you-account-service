import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { debitOrgCredits } from '@/lib/billing-debit'
import { buildPaidServiceAccess } from '@/lib/account-entitlement'

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
 * Body: { orgId, amountUsd, idempotencyKey, purpose? }
 *
 * On success: 200 settled/replay.
 * On empty balance: 402 { error: "no_usable_credits", paid_service_access }.
 * Fork billing wall triggers on inference 402; this is what inference calls
 * after metering (or before, with a tiny authorize check).
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
  }

  const orgId = body.orgId?.trim()
  const idempotencyKey = body.idempotencyKey?.trim()
  const amount = Number(body.amountUsd)
  if (!orgId || !idempotencyKey || !Number.isFinite(amount) || amount <= 0) {
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

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'debit_failed'
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 })
  }
}
