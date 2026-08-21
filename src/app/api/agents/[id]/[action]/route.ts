import { NextRequest, NextResponse } from 'next/server'
import { getAgent, startAgent, stopAgent } from '@/lib/agents'
import { resolvePortalOrg } from '@/lib/request-auth'

export const runtime = 'nodejs'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string; action: string }> }

/**
 * POST /api/agents/:id/:action — action = start | stop
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, action } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { org?: string }
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

  if (action === 'stop') {
    const agent = await stopAgent(row)
    return NextResponse.json({ agent })
  }
  if (action === 'start') {
    try {
      const agent = await startAgent(row)
      return NextResponse.json({ agent })
    } catch (e) {
      return NextResponse.json(
        {
          error: 'start_failed',
          message: e instanceof Error ? e.message : 'start failed',
        },
        { status: 502 },
      )
    }
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
