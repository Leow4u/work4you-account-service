import { NextRequest, NextResponse } from 'next/server'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'
import { revealOrgApiKeySecret } from '@/lib/api-keys'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/keys/:id/secret — owner reveal for Copiar (Hermes copy-on-return).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const { org } = await ensureUserAndOrg(claims.userId)
  const secret = await revealOrgApiKeySecret({ orgId: org.id, keyId: id })
  if (!secret) {
    return NextResponse.json({ error: 'not_copyable' }, { status: 404 })
  }
  return NextResponse.json({ secret })
}
