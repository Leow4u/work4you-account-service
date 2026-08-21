import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKeySecret } from '@/lib/api-keys'

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
 * POST /api/internal/api-keys/resolve
 * Body: { token: "sk-work4you-…" }
 * Auth: INFERENCE_BILLING_SECRET (same as billing authorize/debit).
 */
export async function POST(req: NextRequest) {
  if (!assertInferenceAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { token?: string }
  const token = body.token?.trim()
  if (!token) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const resolved = await resolveApiKeySecret(token)
  if (!resolved) {
    return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 })
  }

  return NextResponse.json({
    keyId: resolved.keyId,
    orgId: resolved.orgId,
    name: resolved.name,
    scope: 'inference:invoke',
  })
}
