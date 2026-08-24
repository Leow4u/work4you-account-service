import { NextRequest, NextResponse } from 'next/server'
import { deletePortalAccount } from '@/lib/account-delete'
import { prisma } from '@/lib/db'
import { authorizationFromRequest } from '@/lib/request-auth'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'

export const runtime = 'nodejs'

/**
 * DELETE /api/account — permanently delete the caller's personal Portal account.
 * Auth: Privy bearer or privy-token cookie only (not OAuth access tokens).
 */
export async function DELETE(req: NextRequest) {
  const authHeader = authorizationFromRequest(req)
  if (!authHeader) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const claims = await verifyPrivyBearer(authHeader)
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { user } = await ensureUserAndOrg(claims.userId)
  const row = await prisma.user.findUnique({ where: { id: user.id } })
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  try {
    await deletePortalAccount(row.id, row.privyDid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'delete_failed'
    if (msg === 'has_team_memberships') {
      return NextResponse.json(
        {
          error: 'has_team_memberships',
          error_description:
            'Não é possível apagar a conta enquanto pertencer a uma organização de equipa.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'server_error', error_description: msg },
      { status: 500 },
    )
  }
}
