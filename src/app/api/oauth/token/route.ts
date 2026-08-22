import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { newOpaqueToken, sha256, signAccessToken } from '@/lib/crypto'
import { buildPaidServiceAccess } from '@/lib/account-entitlement'
import { getTier } from '@/lib/tiers'
import { parseAgentClientId } from '@/lib/agent-redirect-uri'
import {
  OAUTH_CONTRACT_VERSION,
  refreshTtlForClient,
  verifyPkceS256,
} from '@/lib/oauth-agent'

export const runtime = 'nodejs'

function formGet(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description || error },
    { status },
  )
}

async function entitlementClaims(orgId: string) {
  const org = await prisma.org.findUnique({ where: { id: orgId } })
  if (!org) return { paidAccess: false, subscriptionTier: 0 }
  const access = buildPaidServiceAccess(org)
  const tier = getTier(org.subscriptionTierId || 'free')
  return {
    paidAccess: access.allowed,
    subscriptionTier: tier.tierOrder,
  }
}

type TokenExtras = {
  agentInstanceId?: string
  oauthContractVersion?: number
}

async function issueTokens(args: {
  user: { privyDid: string }
  orgId: string
  clientId: string
  scope: string
  sessionId: string
  refreshToken: string
  refreshExpiresAt: Date
  extras?: TokenExtras
}) {
  const ent = await entitlementClaims(args.orgId)
  const { token, expiresIn, jti } = await signAccessToken({
    sub: args.user.privyDid,
    clientId: args.clientId,
    scope: args.scope,
    orgId: args.orgId,
    sessionId: args.sessionId,
    paidAccess: ent.paidAccess,
    subscriptionTier: ent.subscriptionTier,
    agentInstanceId: args.extras?.agentInstanceId,
    oauthContractVersion: args.extras?.oauthContractVersion,
  })

  await prisma.oAuthSession.update({
    where: { id: args.sessionId },
    data: {
      refreshTokenHash: sha256(args.refreshToken),
      accessJti: jti,
      expiresAt: args.refreshExpiresAt,
      lastActiveAt: new Date(),
    },
  })

  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    refresh_token: args.refreshToken,
    scope: args.scope,
  }
}

/**
 * POST /api/oauth/token
 * Supports:
 *  - grant_type=urn:ietf:params:oauth:grant-type:device_code
 *  - grant_type=authorization_code (agent dashboard + PKCE)
 *  - grant_type=refresh_token
 */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const grantType = formGet(form, 'grant_type')
  const clientId = formGet(form, 'client_id') || 'work4you-cli'

  if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
    return deviceCodeGrant(form, clientId)
  }
  if (grantType === 'authorization_code') {
    return authorizationCodeGrant(form, clientId)
  }
  if (grantType === 'refresh_token') {
    const headerRt =
      req.headers.get('x-work4you-refresh-token') ||
      req.headers.get('x-refresh-token') ||
      ''
    const bodyRt = formGet(form, 'refresh_token')
    const refreshToken = bodyRt || headerRt
    return refreshGrant(refreshToken, clientId)
  }
  return oauthError('unsupported_grant_type')
}

async function authorizationCodeGrant(form: FormData, clientId: string) {
  const code = formGet(form, 'code')
  const redirectUri = formGet(form, 'redirect_uri')
  const codeVerifier = formGet(form, 'code_verifier')

  if (!code || !redirectUri || !codeVerifier) {
    return oauthError('invalid_request', 'code, redirect_uri, code_verifier required')
  }

  const parsedClient = parseAgentClientId(clientId)
  if (!parsedClient) {
    return oauthError('invalid_client', 'client_id must be agent:{instance_id}')
  }

  const row = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: sha256(code) },
  })
  if (!row || row.clientId !== clientId) {
    return oauthError('invalid_grant', 'Unknown authorization code')
  }
  if (row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    return oauthError('invalid_grant', 'Authorization code expired')
  }
  if (row.redirectUri !== redirectUri) {
    return oauthError('redirect_uri_mismatch')
  }
  if (!verifyPkceS256(codeVerifier, row.codeChallenge)) {
    return oauthError('invalid_grant', 'PKCE verification failed')
  }
  if (row.agentInstanceId !== parsedClient.instanceId) {
    return oauthError('invalid_client', 'agent_instance_id mismatch')
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId } })
  if (!user) return oauthError('invalid_grant', 'User missing')

  const refreshToken = newOpaqueToken(48)
  const refreshExpiresAt = new Date(Date.now() + refreshTtlForClient(clientId))
  const session = await prisma.oAuthSession.create({
    data: {
      orgId: row.orgId,
      userId: user.id,
      clientId: row.clientId,
      scope: row.scope,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      lastActiveAt: new Date(),
    },
  })

  await prisma.oAuthAuthorizationCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  })

  const payload = await issueTokens({
    user,
    orgId: row.orgId,
    clientId: row.clientId,
    scope: row.scope,
    sessionId: session.id,
    refreshToken,
    refreshExpiresAt,
    extras: {
      agentInstanceId: row.agentInstanceId,
      oauthContractVersion: OAUTH_CONTRACT_VERSION,
    },
  })

  return NextResponse.json(payload)
}

async function deviceCodeGrant(form: FormData, clientId: string) {
  const deviceCode = formGet(form, 'device_code')
  if (!deviceCode) return oauthError('invalid_request', 'device_code required')

  const row = await prisma.deviceCode.findUnique({
    where: { deviceCodeHash: sha256(deviceCode) },
  })
  if (!row || row.clientId !== clientId) {
    return oauthError('invalid_grant', 'Unknown device_code')
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.deviceCode.update({
      where: { id: row.id },
      data: { status: 'expired' },
    })
    return oauthError('expired_token', 'Device code expired')
  }
  if (row.status === 'pending') {
    return oauthError('authorization_pending', 'Waiting for user authorization', 400)
  }
  if (row.status !== 'approved' || !row.approvedUserId || !row.orgId) {
    return oauthError('access_denied', 'Authorization denied')
  }

  const user = await prisma.user.findUnique({ where: { id: row.approvedUserId } })
  if (!user) return oauthError('invalid_grant', 'User missing')

  const refreshToken = newOpaqueToken(48)
  const refreshExpiresAt = new Date(Date.now() + refreshTtlForClient(clientId))
  const session = await prisma.oAuthSession.create({
    data: {
      orgId: row.orgId,
      userId: user.id,
      clientId: row.clientId,
      scope: row.scope,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      lastActiveAt: new Date(),
    },
  })

  const payload = await issueTokens({
    user,
    orgId: row.orgId,
    clientId: row.clientId,
    scope: row.scope,
    sessionId: session.id,
    refreshToken,
    refreshExpiresAt,
  })

  await prisma.deviceCode.update({
    where: { id: row.id },
    data: { status: 'expired' },
  })

  return NextResponse.json(payload)
}

async function refreshGrant(refreshToken: string, clientId: string) {
  if (!refreshToken) return oauthError('invalid_request', 'refresh_token required')

  const session = await prisma.oAuthSession.findUnique({
    where: { refreshTokenHash: sha256(refreshToken) },
    include: { user: true },
  })
  if (!session || session.clientId !== clientId) {
    return oauthError('invalid_grant', 'Unknown refresh_token')
  }
  if (session.revokedAt) {
    return oauthError('invalid_grant', 'Session revoked')
  }
  if (session.expiresAt.getTime() < Date.now()) {
    return oauthError('invalid_grant', 'Refresh token expired')
  }

  const newRefresh = newOpaqueToken(48)
  const refreshExpiresAt = new Date(Date.now() + refreshTtlForClient(clientId))
  const parsedClient = parseAgentClientId(clientId)
  const payload = await issueTokens({
    user: session.user,
    orgId: session.orgId,
    clientId: session.clientId,
    scope: session.scope,
    sessionId: session.id,
    refreshToken: newRefresh,
    refreshExpiresAt,
    extras: parsedClient
      ? {
          agentInstanceId: parsedClient.instanceId,
          oauthContractVersion: OAUTH_CONTRACT_VERSION,
        }
      : undefined,
  })

  return NextResponse.json(payload)
}
