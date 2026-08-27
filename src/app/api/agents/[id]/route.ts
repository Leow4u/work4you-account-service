import { NextRequest, NextResponse } from 'next/server'
import {
  deleteAgent,
  getAgent,
  refreshAgentStatus,
  toAgentDto,
} from '@/lib/agents'
import { resolvePortalOrg } from '@/lib/request-auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/agents/:id — detail + refresh Fly state
 * PATCH — rename { name }
 * DELETE — destroy Fly app + DB row (destroys volume / history — not an update)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }
  const row = await getAgent(resolved.org.id, id)
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const agent = await refreshAgentStatus(row)
  return NextResponse.json({ agent })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    org?: string
  }
  const resolved = await resolvePortalOrg(
    req,
    body.org || req.nextUrl.searchParams.get('org'),
  )
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }
  const row = await getAgent(resolved.org.id, id)
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const name = (body.name || '').trim().slice(0, 64)
  if (!name) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 })
  }
  const updated = await prisma.agentInstance.update({
    where: { id: row.id },
    data: { name },
  })
  return NextResponse.json({ agent: toAgentDto(updated) })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const orgParam = req.nextUrl.searchParams.get('org')
  const resolved = await resolvePortalOrg(req, orgParam)
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status })
  }
  const row = await getAgent(resolved.org.id, id)
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await deleteAgent(row)
  return NextResponse.json({ ok: true })
}
