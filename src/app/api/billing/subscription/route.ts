import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { buildSubscriptionState } from '@/lib/billing'

export const runtime = 'nodejs'

/** GET /api/billing/subscription */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  return NextResponse.json(buildSubscriptionState(actor))
}
