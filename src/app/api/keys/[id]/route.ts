import { NextRequest, NextResponse } from 'next/server'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'
import { renameOrgApiKey, revokeOrgApiKey } from '@/lib/api-keys'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/keys/:id — rename { name }
 * DELETE /api/keys/:id — revoke
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const { org } = await ensureUserAndOrg(claims.userId)
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const key = await renameOrgApiKey({
    orgId: org.id,
    keyId: id,
    name: body.name,
  })
  if (!key) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ key })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const { org } = await ensureUserAndOrg(claims.userId)
  const ok = await revokeOrgApiKey({ orgId: org.id, keyId: id })
  if (!ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
