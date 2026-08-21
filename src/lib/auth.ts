import type { Org, User } from '@prisma/client'
import { prisma } from './db'
import { verifyAccessToken } from './crypto'
import { ensureUserAndOrg, verifyPrivyBearer } from './privy'
import { ensureBillingDefaults } from './org-billing'

export type Actor = {
  user: Pick<User, 'id' | 'privyDid' | 'email'>
  org: Org
  role: string
  scope: string | null
  via: 'privy' | 'oauth'
  sessionId: string | null
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  return token || null
}

export async function resolveActor(authHeader: string | null): Promise<Actor | null> {
  const token = bearerToken(authHeader)
  if (!token) return null

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
    let org = await prisma.org.findUnique({ where: { id: orgId } })
    if (!org) return null
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    })
    if (!member) return null
    org = await ensureBillingDefaults(org.id)

    return {
      user: { id: user.id, privyDid: user.privyDid, email: user.email },
      org,
      role: member.role,
      scope,
      via: 'oauth',
      sessionId,
    }
  } catch {
    // fall through to Privy
  }

  const claims = await verifyPrivyBearer(authHeader)
  if (!claims?.userId) return null
  const { user, org: baseOrg } = await ensureUserAndOrg(claims.userId)
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: baseOrg.id, userId: user.id } },
  })
  if (!member) return null
  const org = await ensureBillingDefaults(baseOrg.id)

  return {
    user: { id: user.id, privyDid: user.privyDid, email: user.email },
    org,
    role: member.role,
    scope: null,
    via: 'privy',
    sessionId: null,
  }
}

export function hasBillingManageScope(actor: Actor): boolean {
  if (actor.via === 'privy') {
    return ['OWNER', 'ADMIN', 'FINANCE_ADMIN'].includes(actor.role.toUpperCase())
  }
  return (actor.scope || '').split(/\s+/).includes('billing:manage')
}

export function canChangePlan(actor: Actor): boolean {
  return ['OWNER', 'ADMIN', 'FINANCE_ADMIN'].includes(actor.role.toUpperCase())
}
