import { randomBytes } from 'crypto'
import type { AgentInstance, Org } from '@prisma/client'
import { prisma } from './db'
import {
  CLOUD_SIZES,
  flyGuestForSize,
  parseCloudSize,
  type CloudSizeId,
} from './cloud-sizes'
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

export async function listAgents(orgId: string): Promise<AgentDto[]> {
  const rows = await prisma.agentInstance.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toAgentDto)
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
    const env: Record<string, string> = {
      WORK4YOU_DASHBOARD: '1',
      WORK4YOU_DASHBOARD_HOST: '0.0.0.0',
      WORK4YOU_DASHBOARD_PORT: String(port),
      WORK4YOU_HOME: '/opt/data',
      PORTAL_URL: process.env.PORTAL_PUBLIC_URL || 'https://portal.work4you.ai',
      WORK4YOU_CLOUD_INSTANCE_ID: row.id,
      WORK4YOU_CLOUD_ORG_ID: args.org.id,
      // Basic auth until Portal OAuth client is wired per-instance.
      WORK4YOU_DASHBOARD_BASIC_AUTH_USERNAME: 'work4you',
      WORK4YOU_DASHBOARD_BASIC_AUTH_PASSWORD: randomBytes(18).toString('base64url'),
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
    // poll path will refresh
  }
  const updated = await prisma.agentInstance.update({
    where: { id: row.id },
    data: {
      status: 'online',
      startedAt: new Date(),
      stoppedAt: null,
      dashboardGatewayState: 'active',
      errorMessage: null,
    },
  })
  return toAgentDto(updated)
}

export async function deleteAgent(row: AgentInstance): Promise<void> {
  await prisma.agentInstance.update({
    where: { id: row.id },
    data: { status: 'deleting' },
  })
  try {
    if (row.flyAppName && row.flyMachineId) {
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
    const updated = await prisma.agentInstance.update({
      where: { id: row.id },
      data: { status, dashboardGatewayState: gateway, errorMessage: null },
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
