import { randomBytes } from 'crypto'
import type { AgentInstance } from '@prisma/client'
import { prisma } from './db'
import { parseAgentClientId } from './agent-redirect-uri'

/** AgentInstance.status for Portal-registered local dashboards (no Fly VM). */
export const SELF_HOSTED_STATUS = 'self_hosted'

/** Sentinel dashboardUrl — OAuth allows loopback redirect URIs on any port. */
export const LOCALHOST_DASHBOARD_URL = 'http://127.0.0.1'

export type SelfHostedDashboardDto = {
  client_id: string
  id: string
  name: string
  kind: 'SELF_HOSTED'
  custom_redirect_uri: string | null
  created_at: string
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
  const suffix = randomBytes(3).toString('hex')
  const stem = base || 'dashboard'
  return `local-${stem}-${suffix}`.slice(0, 48)
}

function dashboardUrlFromRedirect(customRedirectUri?: string | null): string {
  if (!customRedirectUri?.trim()) return LOCALHOST_DASHBOARD_URL
  let parsed: URL
  try {
    parsed = new URL(customRedirectUri.trim())
  } catch {
    throw new Error('invalid_redirect_uri')
  }
  if (!parsed.pathname.endsWith('/auth/callback')) {
    throw new Error('redirect_uri_must_end_with_auth_callback')
  }
  return `${parsed.protocol}//${parsed.host}`
}

export function customRedirectUriFromRow(
  row: AgentInstance,
): string | null {
  const url = row.dashboardUrl?.trim()
  if (!url || url === LOCALHOST_DASHBOARD_URL) return null
  return `${url.replace(/\/$/, '')}/auth/callback`
}

export function toSelfHostedDto(row: AgentInstance): SelfHostedDashboardDto {
  return {
    client_id: `agent:${row.id}`,
    id: row.id,
    name: row.name,
    kind: 'SELF_HOSTED',
    custom_redirect_uri: customRedirectUriFromRow(row),
    created_at: row.createdAt.toISOString(),
  }
}

export async function listSelfHostedDashboards(
  orgId: string,
): Promise<SelfHostedDashboardDto[]> {
  const rows = await prisma.agentInstance.findMany({
    where: { orgId, status: SELF_HOSTED_STATUS },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toSelfHostedDto)
}

export async function registerSelfHostedDashboard(args: {
  orgId: string
  name?: string | null
  custom_redirect_uri?: string | null
  client_id?: string | null
}): Promise<SelfHostedDashboardDto> {
  const clientId = args.client_id?.trim()
  if (clientId) {
    const parsed = parseAgentClientId(clientId)
    if (!parsed) {
      throw new Error('invalid_client_id')
    }
    const existing = await prisma.agentInstance.findFirst({
      where: {
        id: parsed.instanceId,
        orgId: args.orgId,
        status: SELF_HOSTED_STATUS,
      },
    })
    if (existing) {
      const data: { name?: string; dashboardUrl?: string } = {}
      if (args.name?.trim()) {
        data.name = args.name.trim().slice(0, 64)
      }
      if (args.custom_redirect_uri !== undefined) {
        data.dashboardUrl = dashboardUrlFromRedirect(args.custom_redirect_uri)
      }
      const updated = await prisma.agentInstance.update({
        where: { id: existing.id },
        data,
      })
      return toSelfHostedDto(updated)
    }
  }

  const name = args.name?.trim().slice(0, 64)
  if (!name) {
    throw new Error('name_required')
  }

  let dashboardUrl = LOCALHOST_DASHBOARD_URL
  if (args.custom_redirect_uri?.trim()) {
    dashboardUrl = dashboardUrlFromRedirect(args.custom_redirect_uri)
  }

  let slug = slugify(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.agentInstance.create({
        data: {
          orgId: args.orgId,
          name,
          slug,
          status: SELF_HOSTED_STATUS,
          dashboardUrl,
          dashboardGatewayState: 'unknown',
          flyAppName: null,
          flyMachineId: null,
          flyVolumeId: null,
        },
      })
      return toSelfHostedDto(row)
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'P2002' && attempt < 4) {
        slug = slugify(name)
        continue
      }
      throw err
    }
  }
  throw new Error('slug_conflict')
}

export async function revokeSelfHostedDashboard(
  orgId: string,
  id: string,
): Promise<SelfHostedDashboardDto | null> {
  const row = await prisma.agentInstance.findFirst({
    where: { id, orgId, status: SELF_HOSTED_STATUS },
  })
  if (!row) return null
  await prisma.agentInstance.delete({ where: { id: row.id } })
  return toSelfHostedDto(row)
}
