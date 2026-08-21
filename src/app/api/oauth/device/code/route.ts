import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { newOpaqueToken, newUserCode, sha256 } from '@/lib/crypto'

export const runtime = 'nodejs'

function formGet(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * POST /api/oauth/device/code
 * Contract (CLI): application/x-www-form-urlencoded
 *   client_id, scope?
 * Response: device_code, user_code, verification_uri, verification_uri_complete,
 *   expires_in, interval
 */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const clientId = formGet(form, 'client_id') || 'work4you-cli'
  const scope = formGet(form, 'scope') || 'inference:invoke'

  const deviceCode = newOpaqueToken(32)
  const userCode = newUserCode()
  const expiresIn = 900
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  const issuer = process.env.OAUTH_ISSUER || 'https://portal.work4you.ai'
  const verificationUri = `${issuer}/device`
  const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`

  await prisma.deviceCode.create({
    data: {
      deviceCodeHash: sha256(deviceCode),
      userCode,
      clientId,
      scope,
      expiresAt,
      intervalSeconds: 1,
      status: 'pending',
    },
  })

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    expires_in: expiresIn,
    interval: 1,
  })
}
