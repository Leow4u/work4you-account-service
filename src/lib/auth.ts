import { prisma } from './db'
import { verifyAccessToken } from './crypto'
import { ensureUserAndOrg, verifyPrivyBearer } from './privy'

export type Actor = {
  user: { id: string; privyDid: string; email: string | null }
  org: {
    id: string
    slug: string
    name: string
    balanceUsd: string
    cliBillingEnabled: boolean
    stripeCustomerId: string | null
    stripeDefaultPmId: string | null
    cardBrand: string | null
    cardLast4: string | null
    autoReloadEnabled: boolean
    autoReloadThresholdUsd: string | null
    autoReloadAmountUsd: string | null
    monthlyCapUsd: string | null
    monthlySpentUsd: string
  }
  role: string
  /** OAuth scope string when via JWT; null for Privy portal sessions. */
  scope: string | null
  via: 'privy' | 'oauth'
  sessionId: string | null
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  return token || null
}

/**
 * Resolve the caller from Privy (Portal UI) or Work4You OAuth JWT (CLI/Desktop).
 * Prefer OAuth JWT when both verify — CLI tokens are RS256 and won't verify as Privy.
 */
export async function resolveActor(authHeader: string | null): Promise<Actor | null> {
  const token = bearerToken(authHeader)
  if (!token) return null

  // Try OAuth JWT first (CLI / Desktop).
  try {
    const { payload } = await verifyAccessToken(token)
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    const orgId = typeof payload.org_id === 'string' ? payload.org_id : null
    const sessionId =
      typeof payload.session_id === 'string' ? payload.session_id : null
    const scope = typeof payload.scope === 'string' ? payload.scope : ''
    if (!sub || !orgId) return null

    if (sessionId) {
      const session = await prisma.oAuthSession.findUnique({
        where: { id: sessionId },
      })
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() < Date.now() ||
        session.orgId !== orgId
      ) {
        return null
      }
      await prisma.oAuthSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      })
    }

    const user = await prisma.user.findUnique({ where: { privyDid: sub } })
    if (!user) return null
    const org = await prisma.org.findUnique({ where: { id: orgId } })
    if (!org) return null
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    })
    if (!member) return null

    return {
      user: { id: user.id, privyDid: user.privyDid, email: user.email },
      org,
      role: member.role,
      scope,
      via: 'oauth',
      sessionId,
    }
  } catch {
    // Not our JWT — fall through to Privy.
  }

  const claims = await verifyPrivyBearer(authHeader)
  if (!claims?.userId) return null
  const { user, org } = await ensureUserAndOrg(claims.userId)
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
  })
  if (!member) return null

  // Re-fetch org so billing columns are present after schema push.
  const fullOrg = await prisma.org.findUniqueOrThrow({ where: { id: org.id } })

  return {
    user: { id: user.id, privyDid: user.privyDid, email: user.email },
    org: fullOrg,
    role: member.role,
    scope: null,
    via: 'privy',
    sessionId: null,
  }
}

export function hasBillingManageScope(actor: Actor): boolean {
  if (actor.via === 'privy') {
    // Portal UI is already the account owner surface.
    return ['OWNER', 'ADMIN', 'FINANCE_ADMIN'].includes(actor.role.toUpperCase())
  }
  return (actor.scope || '').split(/\s+/).includes('billing:manage')
}

export function canChangePlan(actor: Actor): boolean {
  return ['OWNER', 'ADMIN', 'FINANCE_ADMIN'].includes(actor.role.toUpperCase())
}
