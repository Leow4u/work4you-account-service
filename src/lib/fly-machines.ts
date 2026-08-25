/**
 * Fly Machines REST client for Work4You Cloud (greenfield — not the legacy Wayne stack).
 * Auth: FLY_API_TOKEN (org token). Org slug: FLY_ORG (default personal).
 */

const MACHINES = 'https://api.machines.dev/v1'

function token(): string {
  const t = process.env.FLY_API_TOKEN
  if (!t) throw new Error('FLY_API_TOKEN missing')
  return t
}

function orgSlug(): string {
  return process.env.FLY_ORG || 'personal'
}

async function flyFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${MACHINES}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const err = new Error(
      `fly ${init.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`,
    ) as Error & { status: number; body: unknown }
    err.status = res.status
    err.body = body
    throw err
  }
  return body as T
}

export type FlyApp = {
  id: string
  name: string
  status?: string
}

export type FlyMachine = {
  id: string
  name?: string
  state?: string
  region?: string
  instance_id?: string
}

export type FlyVolume = {
  id: string
  name: string
  size_gb: number
  region: string
}

export async function createFlyApp(name: string): Promise<FlyApp> {
  return flyFetch<FlyApp>('/apps', {
    method: 'POST',
    body: JSON.stringify({ app_name: name, org_slug: orgSlug() }),
  })
}

export async function deleteFlyApp(appName: string): Promise<void> {
  try {
    await flyFetch(`/apps/${encodeURIComponent(appName)}`, { method: 'DELETE' })
  } catch (e) {
    const err = e as { status?: number }
    if (err.status === 404) return
    throw e
  }
}

export async function allocateSharedIpv4(appName: string): Promise<void> {
  // Best-effort: machines with HTTP services often get shared IPv4 automatically.
  // GraphQL allocate is still useful when the platform requires an explicit IP.
  const res = await fetch('https://api.fly.io/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation($input: AllocateIPAddressInput!) {
          allocateIpAddress(input: $input) {
            ipAddress { id address type }
          }
        }
      `,
      variables: {
        input: { appId: appName, type: 'shared_v4' },
      },
    }),
  })
  const json = (await res.json()) as {
    errors?: Array<{ message: string }>
    data?: { allocateIpAddress?: { ipAddress?: unknown } }
  }
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ')
    if (/already|exists|allocated/i.test(msg)) return
    // Non-fatal — service-defined shared IPv4 may still work.
    console.warn(`fly allocateIp (non-fatal): ${msg}`)
  }
}

export async function createVolume(args: {
  appName: string
  name: string
  region: string
  sizeGb: number
}): Promise<FlyVolume> {
  return flyFetch<FlyVolume>(
    `/apps/${encodeURIComponent(args.appName)}/volumes`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: args.name,
        region: args.region,
        size_gb: args.sizeGb,
        encrypted: true,
      }),
    },
  )
}

export async function createMachine(args: {
  appName: string
  region: string
  image: string
  name: string
  guest: { cpu_kind: string; cpus: number; memory_mb: number }
  env: Record<string, string>
  volumeId: string
  internalPort: number
}): Promise<FlyMachine> {
  return flyFetch<FlyMachine>(
    `/apps/${encodeURIComponent(args.appName)}/machines`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: args.name,
        region: args.region,
        config: {
          image: args.image,
          env: args.env,
          guest: args.guest,
          // Golden image ENTRYPOINT is entrypoint-dispatch.sh with empty CMD.
          // Fly Machines are not PID 1, so we must pass the dashboard subcommand
          // explicitly (same as fly.cloud-runtime.toml [processes] app=).
          init: {
            cmd: [
              'dashboard',
              '--host',
              '0.0.0.0',
              '--port',
              String(args.internalPort),
              '--no-open',
            ],
          },
          services: [
            {
              protocol: 'tcp',
              internal_port: args.internalPort,
              ports: [
                { port: 443, handlers: ['tls', 'http'] },
                { port: 80, handlers: ['http'] },
              ],
              force_https: true,
            },
          ],
          mounts: [
            {
              volume: args.volumeId,
              path: '/opt/data',
            },
          ],
          auto_destroy: false,
          restart: { policy: 'on-failure', max_retries: 10 },
        },
      }),
    },
  )
}

export async function waitMachine(
  appName: string,
  machineId: string,
  state: string,
  timeoutSec = 60,
): Promise<void> {
  // Fly Machines wait API rejects timeouts outside [1s, 60s].
  const bounded = Math.max(1, Math.min(60, Math.floor(timeoutSec)))
  const q = new URLSearchParams({
    state,
    timeout: String(bounded),
  })
  await flyFetch(
    `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/wait?${q}`,
  )
}

export async function stopMachine(
  appName: string,
  machineId: string,
): Promise<void> {
  await flyFetch(
    `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/stop`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export async function startMachine(
  appName: string,
  machineId: string,
): Promise<void> {
  await flyFetch(
    `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/start`,
    { method: 'POST' },
  )
}

export async function destroyMachine(
  appName: string,
  machineId: string,
): Promise<void> {
  try {
    await flyFetch(
      `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}?force=true`,
      { method: 'DELETE' },
    )
  } catch (e) {
    const err = e as { status?: number }
    if (err.status === 404) return
    throw e
  }
}

export async function getMachine(
  appName: string,
  machineId: string,
): Promise<FlyMachine> {
  return flyFetch(
    `/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}`,
  )
}

/** Golden image for new agent VMs (deployed to work4you-cloud-runtime). */
export function agentImage(): string {
  return (
    process.env.WORK4YOU_AGENT_IMAGE ||
    // Web chat desktop parity + golden image 2026-08-25.
    'registry.fly.io/work4you-cloud-runtime:deployment-01M0V3JSNBWV55F8MKSBEY7RVV'
  )
}

export function agentDashboardPort(): number {
  const n = Number(process.env.WORK4YOU_AGENT_DASHBOARD_PORT || '8080')
  return Number.isFinite(n) && n > 0 ? n : 8080
}
