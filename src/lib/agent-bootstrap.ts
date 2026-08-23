import type { AgentInstance, Org, User } from '@prisma/client'
import { prisma } from './db'
import { newOpaqueToken, sha256, signAccessToken } from './crypto'
import {
  BOOTSTRAP_CLIENT_ID,
  BOOTSTRAP_REFRESH_TTL_MS,
  BOOTSTRAP_SCOPE,
} from './oauth-agent'

const portalUrl = () =>
  process.env.PORTAL_PUBLIC_URL ||
  process.env.OAUTH_ISSUER ||
  'https://portal.work4you.ai'

export type BootstrapAuthJson = {
  version: number
  active_provider: string
  providers: {
    work4you: {
      portal_base_url: string
      client_id: string
      access_token: string
      refresh_token: string
      expires_at: string
      obtained_at: string
    }
  }
}

/**
 * Mint a long-lived bootstrap OAuth session for a hosted agent VM and return
 * the auth.json document for WORK4YOU_AUTH_JSON_BOOTSTRAP.
 */
export async function mintAgentBootstrapSession(args: {
  org: Org
  user: Pick<User, 'id' | 'privyDid'>
  agent: Pick<AgentInstance, 'id'>
}): Promise<{ sessionId: string; authJson: BootstrapAuthJson }> {
  const refreshToken = newOpaqueToken(48)
  const obtainedAt = new Date()
  const expiresAt = new Date(Date.now() + BOOTSTRAP_REFRESH_TTL_MS)

  const session = await prisma.oAuthSession.create({
    data: {
      orgId: args.org.id,
      userId: args.user.id,
      clientId: BOOTSTRAP_CLIENT_ID,
      scope: BOOTSTRAP_SCOPE,
      refreshTokenHash: sha256(refreshToken),
      expiresAt,
      lastActiveAt: obtainedAt,
    },
  })

  const { token, expiresIn } = await signAccessToken({
    sub: args.user.privyDid,
    clientId: BOOTSTRAP_CLIENT_ID,
    scope: BOOTSTRAP_SCOPE,
    orgId: args.org.id,
    sessionId: session.id,
    agentInstanceId: args.agent.id,
  })

  const expiresAtIso = new Date(
    obtainedAt.getTime() + expiresIn * 1000,
  ).toISOString()

  const authJson: BootstrapAuthJson = {
    version: 1,
    active_provider: 'work4you',
    providers: {
      work4you: {
        portal_base_url: portalUrl().replace(/\/$/, ''),
        client_id: BOOTSTRAP_CLIENT_ID,
        access_token: token,
        refresh_token: refreshToken,
        expires_at: expiresAtIso,
        obtained_at: obtainedAt.toISOString(),
      },
    },
  }

  return { sessionId: session.id, authJson }
}
