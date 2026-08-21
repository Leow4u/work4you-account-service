import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'

export const runtime = 'nodejs'

/**
 * DELETE /api/oauth/sessions/:id — Sign out (revoke) one OAuth login session.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { user, org } = await ensureUserAndOrg(claims.userId)
  const session = await prisma.oAuthSession.findFirst({
    where: { id, orgId: org.id, userId: user.id, revokedAt: null },
  })
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  await prisma.oAuthSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
