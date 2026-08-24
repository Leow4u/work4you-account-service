import { randomBytes } from 'crypto'
import type { AgentInstance, Org, User } from '@prisma/client'
import { prisma } from './db'
import { mintAgentBootstrapSession } from './agent-bootstrap'
import {
  CLOUD_SIZES,
  flyGuestForSize,
  parseCloudSize,
  type CloudSizeId,
} from './cloud-sizes'
import { drainGatewayBeforeLifecycle } from './agent-gateway-drain'
import {
  agentDashboardPort,
  agentImage,
  allocateSharedIpv4,
  createFlyApp,
  createMachine,
  createVolume,
  deleteFlyApp,
  destroyMachine,
  getMachine,
  startMachine,
  stopMachine,
  waitMachine,
} from './fly-machines'

async function drainAgentGateway(row: AgentInstance): Promise<void> {
  if (!row.dashboardUrl || !row.dashboardDrainSecret) return
  await drainGatewayBeforeLifecycle({
    dashboardUrl: row.dashboardUrl,
    drainSecret: row.dashboardDrainSecret,
    suppressNotification: true,
  })
}

export type AgentDto = {
  id: string
  name: string
  status: string
  dashboardUrl: string | null
  dashboardGatewayState: string
  size: string
  model: string | null
  slug: string
  flyAppName: string | null
  region: string
  maxSessions: number
  memoryMb: number
  cpus: number
  diskGb: number
  priceRunningUsd: string
  priceStoppedUsd: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export function toAgentDto(row: AgentInstance): AgentDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    dashboardUrl: row.dashboardUrl,
    dashboardGatewayState: row.dashboardGatewayState,
    size: row.size,
    model: row.model,
    slug: row.slug,
    flyAppName: row.flyAppName,
    region: row.flyRegion,
    maxSessions: row.maxSessions,
    memoryMb: row.memoryMb,
    cpus: row.cpus,
    diskGb: row.diskGb,
    priceRunningUsd: row.priceRunningUsd,
    priceStoppedUsd: row.priceStoppedUsd,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const suffix = randomBytes(3).toString('hex')
  const stem = base || 'agent'
  return `${stem}-${suffix}`
}

function flyAppNameForSlug(slug: string): string {
  // Fly app names: lowercase, digits, hyphens; max ~63.
  return `w4y-agent-${slug}`.slice(0, 63)
}

const FLY_REFRESH_STATUSES = new Set(['provisioning', 'starting', 'deleting'])

function agentNeedsFlyRefresh(row: AgentInstance): boolean {
  if (!row.flyAppName || !row.flyMachineId) return false
  if (FLY_REFRESH_STATUSES.has(row.status)) return true
  // waitMachine timeout: Fly may already be started while DB still says starting.
  if (row.status === 'starting' && row.errorMessage) return true
  return false
}

export async function listAgents(orgId: string): Promise<AgentDto[]> {
  const rows = await prisma.agentInstance.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  })
  return Promise.all(
    rows.map(async (row) => {
      if (agentNeedsFlyRefresh(row)) {
        return refreshAgentStatus(row)
      }
      return toAgentDto(row)
    }),
  )
}

export async function getAgent(
  orgId: string,
  id: string,
): Promise<AgentInstance | null> {
  return prisma.agentInstance.findFirst({ where: { id, orgId } })
}

/**
 * Create DB row + provision Fly app/machine. Returns immediately with
 * status=provisioning|starting; Fly work continues (awaited in-request for
 * serverless — Vercel maxDuration should be raised for this route).
 */
export async function createAndProvisionAgent(args: {
  org: Org
  user: Pick<User, 'id' | 'privyDid'>
  name: string
  size?: unknown
  model?: string | null
}): Promise<AgentDto> {
  const size = parseCloudSize(args.size)
  const spec = CLOUD_SIZES[size]
  const name = args.name.trim().slice(0, 64) || 'Agent'
  const slug = slugify(name)
  const flyAppName = flyAppNameForSlug(slug)
  const region = process.env.FLY_REGION || 'gru'
  const port = agentDashboardPort()
  const portalUrl =
    process.env.PORTAL_PUBLIC_URL ||
    process.env.OAUTH_ISSUER ||
    'https://portal.work4you.ai'

  const row = await prisma.agentInstance.create({
    data: {
      orgId: args.org.id,
      name,
      slug,
      size,
      model: args.model?.trim() || null,
      status: 'provisioning',
      flyAppName,
      flyRegion: region,
      cpus: spec.cpus,
      memoryMb: spec.memoryMb,
      diskGb: spec.diskGb,
      maxSessions: spec.maxSessions,
      priceRunningUsd: spec.priceRunningUsd,
      priceStoppedUsd: spec.priceStoppedUsd,
      dashboardGatewayState: 'unknown',
    },
  })

  try {
    await createFlyApp(flyAppName)
    await allocateSharedIpv4(flyAppName)

    const volume = await createVolume({
      appName: flyAppName,
      name: `data_${slug.replace(/-/g, '_')}`.slice(0, 30),
      region,
      sizeGb: spec.diskGb,
    })

    const dashboardUrl = `https://${flyAppName}.fly.dev`
    const drainSecret = randomBytes(24).toString('base64url')
    const oauthClientId = `agent:${row.id}`

    const bootstrap = await mintAgentBootstrapSession({
      org: args.org,
      user: args.user,
      agent: row,
    })

    const env: Record<string, string> = {
      WORK4YOU_HOME: '/opt/data',
      PORT: String(port),
      WORK4YOU_DASHBOARD_HOST: '0.0.0.0',
      WORK4YOU_DASHBOARD_PORT: String(port),
      WORK4YOU_DASHBOARD_PUBLIC_URL: dashboardUrl,
      WORK4YOU_DASHBOARD_PORTAL_URL: portalUrl,
      WORK4YOU_DASHBOARD_OAUTH_CLIENT_ID: oauthClientId,
      WORK4YOU_DASHBOARD_DRAIN_SECRET: drainSecret,
      WORK4YOU_AUTH_JSON_BOOTSTRAP: JSON.stringify(bootstrap.authJson),
      WORK4YOU_GATEWAY_BOOTSTRAP_STATE: 'running',
      WORK4YOU_CLOUD_INSTANCE_ID: row.id,
      WORK4YOU_CLOUD_ORG_ID: args.org.id,
      WORK4YOU_PORTAL_BASE_URL: portalUrl,
      PORTAL_URL: portalUrl,
    }
    if (args.model?.trim()) {
      env.WORK4YOU_DEFAULT_MODEL = args.model.trim()
    }

    await prisma.agentInstance.update({
      where: { id: row.id },
      data: {
        status: 'starting',
        flyVolumeId: volume.id,
        dashboardUrl,
        bootstrapSessionId: bootstrap.sessionId,
        dashboardDrainSecret: drainSecret,
      },
    })

    const machine = await createMachine({
      appName: flyAppName,
      region,
      image: agentImage(),
      name: `agent-${slug}`.slice(0, 30),
      guest: flyGuestForSize(size),
      env,
      volumeId: volume.id,
      internalPort: port,
    })

    await prisma.agentInstance.update({
      where: { id: row.id },
      data: { flyMachineId: machine.id },
    })

    try {
      await waitMachine(flyAppName, machine.id, 'started', 60)
      const updated = await prisma.agentInstance.update({
        where: { id: row.id },
        data: {
          status: 'online',
          dashboardGatewayState: 'active',
          startedAt: new Date(),
          errorMessage: null,
        },
      })
      return toAgentDto(updated)
    } catch (waitErr) {
      // Machine created but not yet healthy — leave as starting for UI poll.
      const updated = await prisma.agentInstance.update({
        where: { id: row.id },
        data: {
          status: 'starting',
          dashboardGatewayState: 'unknown',
          errorMessage:
            waitErr instanceof Error
              ? waitErr.message.slice(0, 400)
              : 'Aguardando máquina',
        },
      })
      return toAgentDto(updated)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : 'provision failed'
    const updated = await prisma.agentInstance.update({
      where: { id: row.id },
      data: {
        status: 'error',
        dashboardGatewayState: 'down',
        errorMessage: msg,
      },
    })
    return toAgentDto(updated)
  }
}

export async function stopAgent(row: AgentInstance): Promise<AgentDto> {
  if (!row.flyAppName || !row.flyMachineId) {
    const updated = await prisma.agentInstance.update({
      where: { id: row.id },
      data: { status: 'stopped', stoppedAt: new Date(), dashboardGatewayState: 'down' },
    })
    return toAgentDto(updated)
  }
  await drainAgentGateway(row)
  await stopMachine(row.flyAppName, row.flyMachineId)
  const updated = await prisma.agentInstance.update({
    where: { id: row.id },
    data: {
      status: 'stopped',
      stoppedAt: new Date(),
      dashboardGatewayState: 'down',
    },
  })
  return toAgentDto(updated)
}

export async function startAgent(row: AgentInstance): Promise<AgentDto> {
  if (!row.flyAppName || !row.flyMachineId) {
    throw new Error('Instância sem máquina Fly')
  }
  await prisma.agentInstance.update({
    where: { id: row.id },
    data: { status: 'starting', dashboardGatewayState: 'unknown' },
  })
  await startMachine(row.flyAppName, row.flyMachineId)
  try {
    await waitMachine(row.flyAppName, row.flyMachineId, 'started', 60)
  } catch {
    // list/detail refresh reconciles Fly state when wait times out.
  }
  return refreshAgentStatus(
    (await prisma.agentInstance.findUnique({ where: { id: row.id } })) ?? row,
  )
}

export async function deleteAgent(row: AgentInstance): Promise<void> {
  await prisma.agentInstance.update({
    where: { id: row.id },
    data: { status: 'deleting' },
  })
  try {
    if (row.flyAppName && row.flyMachineId) {
      await drainAgentGateway(row)
      await destroyMachine(row.flyAppName, row.flyMachineId)
    }
    if (row.flyAppName) {
      await deleteFlyApp(row.flyAppName)
    }
  } finally {
    await prisma.agentInstance.delete({ where: { id: row.id } })
  }
}

export async function refreshAgentStatus(
  row: AgentInstance,
): Promise<AgentDto> {
  if (!row.flyAppName || !row.flyMachineId) {
    return toAgentDto(row)
  }
  try {
    const m = await getMachine(row.flyAppName, row.flyMachineId)
    const state = (m.state || '').toLowerCase()
    let status = row.status
    let gateway = row.dashboardGatewayState
    if (state === 'started') {
      status = 'online'
      gateway = 'active'
    } else if (state === 'stopped' || state === 'suspended') {
      status = 'stopped'
      gateway = 'down'
    } else if (state === 'created' || state === 'starting') {
      status = 'starting'
      gateway = 'unknown'
    }
    const patch: {
      status: string
      dashboardGatewayState: string
      errorMessage: null
      startedAt?: Date
      stoppedAt?: Date | null
    } = { status, dashboardGatewayState: gateway, errorMessage: null }
    if (status === 'online' && !row.startedAt) {
      patch.startedAt = new Date()
      patch.stoppedAt = null
    }
    const updated = await prisma.agentInstance.update({
      where: { id: row.id },
      data: patch,
    })
    return toAgentDto(updated)
  } catch {
    return toAgentDto(row)
  }
}

export function cloudSizeCatalog() {
  return (Object.keys(CLOUD_SIZES) as CloudSizeId[]).map((id) => ({
    ...CLOUD_SIZES[id],
  }))
}
