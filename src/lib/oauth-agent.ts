import { createHash } from 'crypto'

/** Dashboard OAuth scope (FORK dashboard_auth/work4you contract). */
export const AGENT_DASHBOARD_SCOPE = 'agent_dashboard:access'

/** Bootstrap client for hosted agent → Portal API calls. */
export const BOOTSTRAP_CLIENT_ID = 'work4you-cli-vps'

/** Bootstrap scope for inference + agent management from the VM. */
export const BOOTSTRAP_SCOPE = 'inference:invoke agent:manage'

/** Dashboard refresh sessions (rotating). */
export const DASHBOARD_REFRESH_TTL_MS = 24 * 60 * 60 * 1000

/** Bootstrap / CLI refresh sessions. */
export const BOOTSTRAP_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const OAUTH_CONTRACT_VERSION = 1

export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string,
): boolean {
  if (!codeVerifier || !codeChallenge) return false
  const digest = createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url')
  return digest === codeChallenge
}

export function refreshTtlForClient(clientId: string): number {
  if (clientId.startsWith('agent:')) return DASHBOARD_REFRESH_TTL_MS
  return BOOTSTRAP_REFRESH_TTL_MS
}
