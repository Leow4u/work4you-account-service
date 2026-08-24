/**
 * NAS-driven gateway drain before Fly lifecycle actions (stop / delete).
 *
 * Contract (gateway/run.py Phase 2): POST begin-drain on the agent dashboard,
 * poll public GET /api/status until active_agents === 0, then proceed with
 * stopMachine / destroyMachine. Uses the per-agent WORK4YOU_DASHBOARD_DRAIN_SECRET
 * bearer token; /api/status needs no auth.
 */

export type GatewayStatusSnapshot = {
  active_agents?: number | string
  gateway_running?: boolean
  gateway_busy?: boolean
  gateway_state?: string
  restart_drain_timeout?: number
}

export type GatewayDrainResult = {
  /** True when the gateway reported zero in-flight turns (or was already down). */
  drained: boolean
  reason: string
}

const POLL_INTERVAL_MS = 1000
/** Leave headroom under Vercel route maxDuration=120 for Fly API calls. */
const DEFAULT_MAX_POLL_MS = 100_000
const STATUS_FETCH_TIMEOUT_MS = 10_000
const DRAIN_POST_TIMEOUT_MS = 15_000

function parseActiveAgents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return 0
}

function resolvePollBudgetMs(status: GatewayStatusSnapshot | null): number {
  const fromStatus = status?.restart_drain_timeout
  if (typeof fromStatus === 'number' && Number.isFinite(fromStatus) && fromStatus > 0) {
    return Math.min(fromStatus * 1000, DEFAULT_MAX_POLL_MS)
  }
  return DEFAULT_MAX_POLL_MS
}

async function fetchGatewayStatus(baseUrl: string): Promise<GatewayStatusSnapshot | null> {
  const resp = await fetch(`${baseUrl}/api/status`, {
    signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS),
  })
  if (!resp.ok) return null
  return (await resp.json()) as GatewayStatusSnapshot
}

/**
 * Begin external drain and wait for in-flight gateway turns to finish.
 * Best-effort: unreachable agents or poll timeouts still allow the caller to stop.
 */
export async function drainGatewayBeforeLifecycle(args: {
  dashboardUrl: string
  drainSecret: string
  suppressNotification?: boolean
}): Promise<GatewayDrainResult> {
  const base = args.dashboardUrl.trim().replace(/\/$/, '')
  const secret = args.drainSecret.trim()
  if (!base || !secret) {
    return { drained: false, reason: 'missing_url_or_secret' }
  }

  try {
    const resp = await fetch(`${base}/api/gateway/drain`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'drain',
        suppress_notification: args.suppressNotification ?? true,
      }),
      signal: AbortSignal.timeout(DRAIN_POST_TIMEOUT_MS),
    })
    if (!resp.ok) {
      return { drained: false, reason: `drain_post_${resp.status}` }
    }
  } catch {
    return { drained: false, reason: 'drain_post_unreachable' }
  }

  const started = Date.now()
  let budgetMs = DEFAULT_MAX_POLL_MS
  let lastActive = -1

  while (Date.now() - started < budgetMs) {
    let status: GatewayStatusSnapshot | null = null
    try {
      status = await fetchGatewayStatus(base)
      if (budgetMs === DEFAULT_MAX_POLL_MS) {
        budgetMs = resolvePollBudgetMs(status)
      }
    } catch {
      // Transient — keep polling until the budget expires.
    }

    if (status?.gateway_running === false) {
      return { drained: true, reason: 'gateway_down' }
    }

    const active = parseActiveAgents(status?.active_agents)
    lastActive = active
    if (active === 0) {
      return { drained: true, reason: 'quiescent' }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return { drained: false, reason: `timeout_active_${lastActive}` }
}
