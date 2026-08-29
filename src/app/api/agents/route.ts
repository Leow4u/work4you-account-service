import { NextRequest, NextResponse } from 'next/server'
import {
  cloudSizeCatalog,
  createAndProvisionAgent,
  listAgents,
} from '@/lib/agents'
import {
  fetchAnnotatedModelsForOrg,
  resolveProvisionModel,
} from '@/lib/inference-catalog'
import { HOUSE_MODEL_ID } from '@/lib/model-access'
import { resolvePortalOrg } from '@/lib/request-auth'

export const runtime = 'nodejs'
/** Provisioning talks to Fly Machines — allow a long serverless window. */
export const maxDuration = 300

/**
 * GET /api/agents?org= — list Cloud instances; reconciles Fly state for pending rows.
 * Auth: Bearer or privy-token cookie.
 * Multi-org without ?org= → 409 org_selection_required.
 *
 * POST /api/agents — create + provision { name, size?, model?, org? }
 */
export async function GET(req: NextRequest) {
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  const agents = await listAgents(resolved.org.id)
  return NextResponse.json({
    agents,
    org: {
      id: resolved.org.id,
      slug: resolved.org.slug,
      name: resolved.org.name,
      isPersonal: resolved.org.personal,
      role: resolved.role,
    },
    sizes: cloudSizeCatalog(),
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    size?: string
    model?: string
    org?: string
  }
  const orgParam =
    body.org || req.nextUrl.searchParams.get('org') || null
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  const name = (body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 })
  }

  if (!process.env.FLY_API_TOKEN) {
    return NextResponse.json(
      { error: 'fly_not_configured', message: 'FLY_API_TOKEN em falta no Portal.' },
      { status: 503 },
    )
  }

  let model = body.model?.trim() || null
  const catalog = await fetchAnnotatedModelsForOrg({
    org: resolved.org,
    user: resolved.user,
  })
  if (!('error' in catalog)) {
    model = resolveProvisionModel(catalog, model)
  } else if (!model) {
    model = HOUSE_MODEL_ID
  }

  const agent = await createAndProvisionAgent({
    org: resolved.org,
    user: resolved.user,
    name,
    size: body.size,
    model,
  })
  return NextResponse.json({ agent }, { status: 201 })
}
