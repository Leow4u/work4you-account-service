import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'

export const runtime = 'nodejs'

/**
 * POST /api/oauth/device/approve
 * Body JSON: { user_code: "ABCD-EFGH" }
 * Auth: Privy bearer — binds the pending device code to this user/org.
 */
export async function POST(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { user_code?: string } | null
  const userCode = (body?.user_code || '').trim().toUpperCase()
  if (!userCode) {
    return NextResponse.json({ error: 'user_code_required' }, { status: 400 })
  }

  const row = await prisma.deviceCode.findUnique({ where: { userCode } })
  if (!row) {
    return NextResponse.json({ error: 'invalid_user_code' }, { status: 404 })
  }
  if (row.expiresAt.getTime() < Date.now() || row.status === 'expired') {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }
  if (row.status === 'approved') {
    return NextResponse.json({ ok: true, status: 'already_approved' })
  }

  const { user, org } = await ensureUserAndOrg(claims.userId)

  await prisma.deviceCode.update({
    where: { id: row.id },
    data: {
      status: 'approved',
      approvedUserId: user.id,
      orgId: org.id,
      approvedAt: new Date(),
    },
  })

  return NextResponse.json({
    ok: true,
    clientId: row.clientId,
    scope: row.scope,
    orgSlug: org.slug,
  })
}
