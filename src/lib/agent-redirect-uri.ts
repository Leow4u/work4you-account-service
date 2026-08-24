/**
 * Agent dashboard OAuth redirect_uri validation.
 * Contract: redirect_uri must be `{dashboardUrl}/auth/callback`.
 */

export function normalizeRedirectUri(uri: string): string {
  try {
    const u = new URL(uri.trim())
    u.hash = ''
    // Drop default ports for stable comparison.
    if (
      (u.protocol === 'https:' && u.port === '443') ||
      (u.protocol === 'http:' && u.port === '80')
    ) {
      u.port = ''
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return uri.trim().replace(/\/$/, '')
  }
}

export function expectedAgentCallbackUri(dashboardUrl: string): string {
  const base = dashboardUrl.trim().replace(/\/$/, '')
  return `${base}/auth/callback`
}

export function isLoopbackRedirectUri(redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri.trim())
    const host = u.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

/** Self-hosted dashboards registered without a public URL (Portal: LOCALHOST ONLY). */
export function isLocalhostOnlyDashboard(
  dashboardUrl: string | null | undefined,
): boolean {
  if (!dashboardUrl?.trim()) return true
  const base = dashboardUrl.trim().replace(/\/$/, '')
  return base === 'http://127.0.0.1' || base === 'http://localhost'
}

export function isAllowedAgentRedirectUri(
  dashboardUrl: string | null | undefined,
  redirectUri: string,
): boolean {
  if (isLocalhostOnlyDashboard(dashboardUrl)) {
    const path = redirectUri.trim()
    if (!path.endsWith('/auth/callback')) return false
    return isLoopbackRedirectUri(redirectUri)
  }
  if (!dashboardUrl?.trim()) return false
  return (
    normalizeRedirectUri(redirectUri) ===
    normalizeRedirectUri(expectedAgentCallbackUri(dashboardUrl))
  )
}

export function parseAgentClientId(
  clientId: string,
): { instanceId: string } | null {
  const trimmed = clientId.trim()
  if (!trimmed.startsWith('agent:')) return null
  const instanceId = trimmed.slice('agent:'.length)
  if (!instanceId) return null
  return { instanceId }
}
