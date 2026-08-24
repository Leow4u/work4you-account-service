import { NextRequest, NextResponse } from 'next/server'
import { fetchAnnotatedModelsForOrg } from '@/lib/inference-catalog'
import { resolvePortalOrg } from '@/lib/request-auth'

export const runtime = 'nodejs'

/**
 * GET /api/keys/models?org= — catalog for playground / Cloud create with locked flags.
 */
export async function GET(req: NextRequest) {
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  const catalog = await fetchAnnotatedModelsForOrg({
    org: resolved.org,
    user: resolved.user,
  })
  if ('error' in catalog) {
    return NextResponse.json(
      { error: catalog.error, status: catalog.status },
      { status: 502 },
    )
  }

  return NextResponse.json(catalog)
}
