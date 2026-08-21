import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { buildOAuthAccountPayload } from '@/lib/account-entitlement'

export const runtime = 'nodejs'

/** GET /api/oauth/account — fork Work4YouPortalAccountInfo source of truth. */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  return NextResponse.json(buildOAuthAccountPayload(actor))
}
