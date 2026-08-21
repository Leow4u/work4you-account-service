import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  buildUsageReport,
  parseCreditScope,
  parseGranularity,
  type UsageGroupBy,
} from '@/lib/billing-usage'

export const runtime = 'nodejs'

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000

/**
 * GET /api/billing/usage
 * Auth: Bearer Privy (Portal) OR Work4You OAuth JWT (CLI).
 *
 * Aggregates existing BillingDebit rows (spend / requests / model / credit scope).
 * Token & cache totals are 0 — not stored on debit today.
 *
 * Query: from, to (ISO), granularity=hour|day|week, creditScope=all|api|subscription,
 *        groupBy=model
 */
export async function GET(req: NextRequest) {
  const actor = await resolveActor(req.headers.get('authorization'))
  if (!actor) {
    return NextResponse.json(
      { error: 'invalid_token', message: 'Unauthorized' },
      { status: 401 },
    )
  }

  const url = req.nextUrl
  const now = new Date()
  const toRaw = url.searchParams.get('to')
  const fromRaw = url.searchParams.get('from')
  let to = toRaw ? new Date(toRaw) : now
  let from = fromRaw
    ? new Date(fromRaw)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json(
      { error: 'invalid_range', message: 'from/to must be ISO dates' },
      { status: 400 },
    )
  }
  if (from.getTime() > to.getTime()) {
    const tmp = from
    from = to
    to = tmp
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    from = new Date(to.getTime() - MAX_RANGE_MS)
  }

  const granularity = parseGranularity(url.searchParams.get('granularity'))
  const creditScope = parseCreditScope(url.searchParams.get('creditScope'))
  const groupByParam = url.searchParams.get('groupBy')
  const groupBy: UsageGroupBy =
    groupByParam === 'model' || !groupByParam ? 'model' : 'model'

  const rows = await prisma.billingDebit.findMany({
    where: {
      orgId: actor.org.id,
      createdAt: { gte: from, lte: to },
    },
    select: {
      amountUsd: true,
      subscriptionTakenUsd: true,
      purchasedTakenUsd: true,
      purpose: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const report = buildUsageReport(rows, {
    from,
    to,
    granularity,
    creditScope,
    groupBy,
  })

  return NextResponse.json({
    orgId: actor.org.id,
    ...report,
  })
}
