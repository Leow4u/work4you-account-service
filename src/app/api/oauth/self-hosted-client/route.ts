import { NextRequest, NextResponse } from 'next/server'
import {
  listSelfHostedDashboards,
  registerSelfHostedDashboard,
} from '@/lib/self-hosted-dashboard'
import { resolvePortalOrg } from '@/lib/request-auth'

export const runtime = 'nodejs'

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description || error },
    { status },
  )
}

/**
 * GET /api/oauth/self-hosted-client?org= — list SELF_HOSTED dashboards.
 * POST — register or update (Fork: `work4you dashboard register`).
 */
export async function GET(req: NextRequest) {
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }
  const dashboards = await listSelfHostedDashboards(resolved.org.id)
  return NextResponse.json({ dashboards })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    name?: string
    custom_redirect_uri?: string | null
    client_id?: string
    org?: string
  } | null
  if (!body) return oauthError('invalid_request', 'JSON body required')

  const orgParam =
    body.org || req.nextUrl.searchParams.get('org') || null
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  try {
    const dashboard = await registerSelfHostedDashboard({
      orgId: resolved.org.id,
      name: body.name,
      custom_redirect_uri: body.custom_redirect_uri,
      client_id: body.client_id,
    })
    return NextResponse.json(dashboard, { status: body.client_id ? 200 : 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'registration_failed'
    if (msg === 'name_required') {
      return oauthError('invalid_request', 'name is required')
    }
    if (msg === 'invalid_client_id') {
      return oauthError('invalid_client', 'client_id must be agent:{instance_id}')
    }
    if (msg === 'invalid_redirect_uri') {
      return oauthError('invalid_request', 'custom_redirect_uri is not a valid URL')
    }
    if (msg === 'redirect_uri_must_end_with_auth_callback') {
      return oauthError(
        'invalid_request',
        "custom_redirect_uri must end with '/auth/callback'",
      )
    }
    return oauthError('server_error', msg, 500)
  }
}
