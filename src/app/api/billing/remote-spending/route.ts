import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { canChangePlan, resolveActor } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * PATCH /api/billing/remote-spending
 * Portal Work4You page kill-switch (fork docs: cli_billing_disabled).
 * Body: { enabled: boolean }
 * Privy session + canChangePlan; not called by CLI.
 */
export async function PATCH(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  if (!canChangePlan(actor)) {
    return NextResponse.json(
      {
        error: 'role_required',
        portalUrl: `/orgs/${actor.org.slug}`,
      },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const org = await prisma.org.update({
    where: { id: actor.org.id },
    data: { cliBillingEnabled: body.enabled },
  })

  return NextResponse.json({
    cliBillingEnabled: org.cliBillingEnabled,
    message: org.cliBillingEnabled
      ? 'Remote Spending ligado para terminais desta conta.'
      : 'Remote Spending desligado — terminais não podem cobrar cartão.',
  })
}
