import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { newOpaqueToken, sha256, signAccessToken } from '@/lib/crypto'

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

/**
 * POST /api/oauth/token
 * Supports:
 *  - grant_type=urn:ietf:params:oauth:grant-type:device_code
 *  - grant_type=refresh_token
 */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const grantType = formGet(form, 'grant_type')
  const clientId = formGet(form, 'client_id') || 'work4you-cli'

  if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
    return deviceCodeGrant(form, clientId)
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
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000)
  const session = await prisma.oAuthSession.create({
    data: {
      orgId: row.orgId,
      userId: user.id,
      clientId: row.clientId,
      scope: row.scope,
      refreshTokenHash: sha256(refreshToken),
      expiresAt,
      lastActiveAt: new Date(),
    },
  })

  const { token, expiresIn, jti } = await signAccessToken({
    sub: user.privyDid,
    clientId: row.clientId,
    scope: row.scope,
    orgId: row.orgId,
    sessionId: session.id,
  })

  await prisma.oAuthSession.update({
    where: { id: session.id },
    data: { accessJti: jti },
  })

  // One-time device code
  await prisma.deviceCode.update({
    where: { id: row.id },
    data: { status: 'expired' },
  })

  return NextResponse.json({
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: row.scope,
  })
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
  const { token, expiresIn, jti } = await signAccessToken({
    sub: session.user.privyDid,
    clientId: session.clientId,
    scope: session.scope,
    orgId: session.orgId,
    sessionId: session.id,
  })

  await prisma.oAuthSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: sha256(newRefresh),
      accessJti: jti,
      lastActiveAt: new Date(),
    },
  })

  return NextResponse.json({
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    refresh_token: newRefresh,
    scope: session.scope,
  })
}
