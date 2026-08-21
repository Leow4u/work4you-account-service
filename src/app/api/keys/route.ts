import { NextRequest, NextResponse } from 'next/server'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'
import { createOrgApiKey, listOrgApiKeys } from '@/lib/api-keys'

export const runtime = 'nodejs'

/**
 * GET /api/keys — list active API keys for the Privy user's org.
 * POST /api/keys — create { name? }; returns { key, secret } (secret once).
 */
export async function GET(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { org } = await ensureUserAndOrg(claims.userId)
  const keys = await listOrgApiKeys(org.id)
  return NextResponse.json({ orgId: org.slug, keys })
}

export async function POST(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { org } = await ensureUserAndOrg(claims.userId)
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  const created = await createOrgApiKey({ orgId: org.id, name: body.name })
  return NextResponse.json(created, { status: 201 })
}
