import { createHash, randomBytes, randomInt } from 'crypto'
import { exportJWK, importPKCS8, importSPKI, SignJWT, jwtVerify, calculateJwkThumbprint } from 'jose'

const ISSUER = () => process.env.OAUTH_ISSUER || 'https://portal.work4you.ai'

function b64Pem(envName: string): string {
  const raw = process.env[envName]
  if (!raw) throw new Error(`${envName} is not set`)
  return Buffer.from(raw, 'base64').toString('utf8')
}

let privateKeyPromise: ReturnType<typeof importPKCS8> | null = null
let publicKeyPromise: ReturnType<typeof importSPKI> | null = null

async function privateKey() {
  if (!privateKeyPromise) {
    privateKeyPromise = importPKCS8(b64Pem('JWT_PRIVATE_KEY_B64'), 'RS256')
  }
  return privateKeyPromise
}

async function publicKey() {
  if (!publicKeyPromise) {
    publicKeyPromise = importSPKI(b64Pem('JWT_PUBLIC_KEY_B64'), 'RS256')
  }
  return publicKeyPromise
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Human device user_code like ABCD-EFGH */
export function newUserCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = (n: number) =>
    Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${part(4)}-${part(4)}`
}

export async function getJwks() {
  const key = await publicKey()
  const jwk = await exportJWK(key)
  const kid = await calculateJwkThumbprint(jwk)
  return {
    keys: [
      {
        ...jwk,
        kid,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  }
}

export async function signAccessToken(params: {
  sub: string
  clientId: string
  scope: string
  orgId: string
  sessionId: string
  expiresInSec?: number
  /** Fork JWT entitlement snapshot (UX gate; API remains authoritative). */
  paidAccess?: boolean
  subscriptionTier?: number
}): Promise<{ token: string; expiresIn: number; jti: string }> {
  const expiresIn = params.expiresInSec ?? 15 * 60
  const jti = newOpaqueToken(16)
  const key = await privateKey()
  const jwk = await exportJWK(await publicKey())
  const kid = await calculateJwkThumbprint(jwk)

  const claims: Record<string, unknown> = {
    scope: params.scope,
    client_id: params.clientId,
    org_id: params.orgId,
    session_id: params.sessionId,
  }
  if (typeof params.paidAccess === 'boolean') {
    claims.paid_access = params.paidAccess
  }
  if (typeof params.subscriptionTier === 'number') {
    claims.subscription_tier = params.subscriptionTier
  }

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(ISSUER())
    .setAudience(params.clientId)
    .setSubject(params.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key)

  return { token, expiresIn, jti }
}

export async function verifyAccessToken(token: string) {
  const key = await publicKey()
  return jwtVerify(token, key, { issuer: ISSUER() })
}
