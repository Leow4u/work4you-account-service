import { NextRequest, NextResponse } from 'next/server'
import { revokeSelfHostedDashboard } from '@/lib/self-hosted-dashboard'
import { resolvePortalOrg } from '@/lib/request-auth'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** DELETE /api/oauth/self-hosted-client/:id — revoke a local dashboard registration. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }

  const revoked = await revokeSelfHostedDashboard(resolved.org.id, id)
  if (!revoked) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, dashboard: revoked })
}
