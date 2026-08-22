import { NextRequest, NextResponse } from 'next/server'
import type { AgentInstance } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  isAllowedAgentRedirectUri,
  parseAgentClientId,
} from '@/lib/agent-redirect-uri'
import { newOpaqueToken, sha256 } from '@/lib/crypto'
import { resolvePortalOrg } from '@/lib/request-auth'
import { AGENT_DASHBOARD_SCOPE } from '@/lib/oauth-agent'

export const runtime = 'nodejs'

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description || error },
    { status },
  )
}

/**
 * POST /api/oauth/authorize/approve
 * Body JSON: standard OAuth authorize query params.
 * Auth: Privy bearer / cookie — user must belong to the agent's org.
 */
export async function POST(req: NextRequest) {
  const resolved = await resolvePortalOrg(req, null)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  const body = (await req.json().catch(() => null)) as {
    response_type?: string
    client_id?: string
    redirect_uri?: string
    scope?: string
    state?: string
    code_challenge?: string
    code_challenge_method?: string
  } | null

  if (!body) return oauthError('invalid_request', 'JSON body required')

  const responseType = (body.response_type || '').trim()
  const clientId = (body.client_id || '').trim()
  const redirectUri = (body.redirect_uri || '').trim()
  const scope = (body.scope || '').trim()
  const state = (body.state || '').trim()
  const codeChallenge = (body.code_challenge || '').trim()
  const codeChallengeMethod = (body.code_challenge_method || 'S256').trim()

  if (responseType !== 'code') {
    return oauthError('unsupported_response_type')
  }
  const parsedClient = parseAgentClientId(clientId)
  if (!parsedClient) {
    return oauthError('invalid_client', 'client_id must be agent:{instance_id}')
  }
  if (scope !== AGENT_DASHBOARD_SCOPE) {
    return oauthError('invalid_scope', `scope must be ${AGENT_DASHBOARD_SCOPE}`)
  }
  if (!redirectUri || !state || !codeChallenge) {
    return oauthError('invalid_request', 'missing required parameter')
  }
  if (codeChallengeMethod !== 'S256') {
    return oauthError(
      'invalid_request',
      'only S256 code_challenge_method is supported',
    )
  }

  const agent = await prisma.agentInstance.findFirst({
    where: { id: parsedClient.instanceId, orgId: resolved.org.id },
  })
  if (!agent) {
    return oauthError('invalid_client', 'unknown agent instance')
  }
  if (!isAllowedAgentRedirectUri(agent.dashboardUrl, redirectUri)) {
    return oauthError('redirect_uri_mismatch')
  }

  const code = newOpaqueToken(32)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: sha256(code),
      clientId,
      redirectUri,
      scope,
      orgId: resolved.org.id,
      userId: resolved.user.id,
      agentInstanceId: agent.id,
      codeChallenge,
      codeChallengeMethod,
      expiresAt,
    },
  })

  const sep = redirectUri.includes('?') ? '&' : '?'
  const redirect = `${redirectUri}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`

  return NextResponse.json({
    ok: true,
    redirect,
    agent: agentSummary(agent),
  })
}

function agentSummary(agent: AgentInstance) {
  return {
    id: agent.id,
    name: agent.name,
    dashboardUrl: agent.dashboardUrl,
  }
}
