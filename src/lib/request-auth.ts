import type { NextRequest } from 'next/server'
import type { Org, User } from '@prisma/client'
import { prisma } from './db'
import { resolveActor, type Actor } from './auth'
import { ensureUserAndOrg, verifyPrivyBearer } from './privy'
import { ensureBillingDefaults } from './org-billing'

/**
 * Desktop discovery sends only the Privy cookie jar (no Authorization header).
 * Portal UI sends `Authorization: Bearer <privy access token>`.
 * Normalize both into a Bearer header for resolveActor / verifyPrivyBearer.
 */
export function authorizationFromRequest(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ') && header.length > 'Bearer '.length) {
    return header
  }
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(
    /(?:^|;\s*)(?:__Host-|__Secure-)?privy-token=([^;]+)/i,
  )
  if (!match?.[1]) return null
  try {
    return `Bearer ${decodeURIComponent(match[1].trim())}`
  } catch {
    return `Bearer ${match[1].trim()}`
  }
}

export type OrgChoice = {
  id: string
  slug: string | null
  name: string
  isPersonal: boolean
  role: string
}

function toOrgChoice(
  org: Org,
  role: string,
): OrgChoice {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    isPersonal: org.personal,
    role,
  }
}

export type ResolvedPortalOrg =
  | {
      ok: true
      user: Pick<User, 'id' | 'privyDid' | 'email'>
      org: Org
      role: string
      actor: Actor | null
    }
  | {
      ok: false
      status: 401
      body: { error: 'unauthorized' }
    }
  | {
      ok: false
      status: 403
      body: { error: 'forbidden' }
    }
  | {
      ok: false
      status: 409
      body: {
        error: 'org_selection_required'
        orgs: OrgChoice[]
      }
    }

/**
 * Resolve the calling user + org for Cloud / Desktop endpoints.
 * - Bearer or privy-token cookie
 * - Optional `?org=` (id or slug)
 * - Single membership → that org
 * - Multiple without `org` → 409 org_selection_required (Desktop picker)
 */
export async function resolvePortalOrg(
  req: NextRequest,
  orgParam?: string | null,
): Promise<ResolvedPortalOrg> {
  const authHeader = authorizationFromRequest(req)
  if (!authHeader) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }

  // Prefer OAuth access tokens (CLI / future agent bootstrap) when present.
  const actor = await resolveActor(authHeader)
  if (actor?.via === 'oauth') {
    const memberships = await prisma.orgMember.findMany({
      where: { userId: actor.user.id },
      include: { org: true },
    })
    return pickOrg({
      user: actor.user,
      memberships,
      orgParam,
      actor,
    })
  }

  const claims = await verifyPrivyBearer(authHeader)
  if (!claims?.userId) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }
  const { user } = await ensureUserAndOrg(claims.userId)
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { org: true },
  })
  return pickOrg({
    user: { id: user.id, privyDid: user.privyDid, email: user.email },
    memberships,
    orgParam,
    actor: null,
  })
}

async function pickOrg(args: {
  user: Pick<User, 'id' | 'privyDid' | 'email'>
  memberships: Array<{ role: string; org: Org }>
  orgParam?: string | null
  actor: Actor | null
}): Promise<ResolvedPortalOrg> {
  const { user, memberships, orgParam, actor } = args
  if (memberships.length === 0) {
    return { ok: false, status: 403, body: { error: 'forbidden' } }
  }

  if (orgParam) {
    const hit = memberships.find(
      (m) => m.org.id === orgParam || m.org.slug === orgParam,
    )
    if (!hit) {
      return { ok: false, status: 403, body: { error: 'forbidden' } }
    }
    const org = await ensureBillingDefaults(hit.org.id)
    return {
      ok: true,
      user,
      org,
      role: hit.role,
      actor,
    }
  }

  if (memberships.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'org_selection_required',
        orgs: memberships.map((m) => toOrgChoice(m.org, m.role)),
      },
    }
  }

  const only = memberships[0]!
  const org = await ensureBillingDefaults(only.org.id)
  return {
    ok: true,
    user,
    org,
    role: only.role,
    actor,
  }
}
