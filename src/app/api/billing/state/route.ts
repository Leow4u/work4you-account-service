import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { buildBillingState } from '@/lib/billing'

export const runtime = 'nodejs'

/**
 * GET /api/billing/state
 * Auth: Bearer Privy (Portal) OR Work4You OAuth JWT (CLI).
 * No billing:manage scope required (read overview).
 */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json(
      { error: 'invalid_token', message: 'Unauthorized' },
      { status: 401 },
    )
  }

  return NextResponse.json(buildBillingState(actor))
}
