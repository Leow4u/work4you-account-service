import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureUserAndOrg, verifyPrivyBearer } from '@/lib/privy'

export const runtime = 'nodejs'

function formatPtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

function formatRelative(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (sec < 60) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h`
  const days = Math.floor(h / 24)
  return `${days}d`
}

/**
 * GET /api/oauth/sessions — list active OAuth logins for the Privy user.
 * Authorization: Bearer <Privy access token>
 */
export async function GET(req: NextRequest) {
  const claims = await verifyPrivyBearer(req.headers.get('authorization'))
  if (!claims?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { user, org } = await ensureUserAndOrg(claims.userId)

  const rows = await prisma.oAuthSession.findMany({
    where: {
      orgId: org.id,
      userId: user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActiveAt: 'desc' },
  })

  return NextResponse.json({
    orgId: org.slug,
    sessions: rows.map((r) => ({
      id: r.id,
      app: r.clientId,
      createdLabel: formatPtDate(r.createdAt),
      lastActiveLabel: formatRelative(r.lastActiveAt),
      expiresLabel: formatPtDate(r.expiresAt),
      remoteSpending: r.scope.split(/\s+/).includes('billing:manage')
        ? 'granted'
        : 'not_granted',
    })),
  })
}
