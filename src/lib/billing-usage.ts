/**
 * Usage aggregation over existing BillingDebit rows.
 * Spend / requests / credit-scope / model grouping only —
 * token & cache fields stay 0 (not persisted on debit today).
 */

export type CreditScope = 'all' | 'api' | 'subscription'
export type Granularity = 'hour' | 'day' | 'week'
export type UsageGroupBy = 'model'

export type DebitUsageRow = {
  amountUsd: string
  subscriptionTakenUsd: string
  purchasedTakenUsd: string
  purpose: string | null
  createdAt: Date
}

export type UsagePoint = {
  t: string
  spendUsd: number
  creditsUsd: number
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReads: number
  cacheWrites: number
  totalTokens: number
}

export type UsageSeries = {
  id: string
  label: string
  points: UsagePoint[]
}

export type UsageTotals = {
  spendUsd: string
  creditsUsd: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReads: number
  cacheWrites: number
  totalTokens: number
}

export type UsageReport = {
  from: string
  to: string
  granularity: Granularity
  creditScope: CreditScope
  groupBy: UsageGroupBy
  totals: UsageTotals
  buckets: string[]
  series: UsageSeries[]
}

function parseUsd(raw: string | null | undefined): number {
  const n = Number(raw || 0)
  return Number.isFinite(n) ? n : 0
}

/** USD attributed for the selected credit scope. */
export function debitAmountForScope(
  row: DebitUsageRow,
  scope: CreditScope,
): number {
  if (scope === 'subscription') return parseUsd(row.subscriptionTakenUsd)
  if (scope === 'api') return parseUsd(row.purchasedTakenUsd)
  return parseUsd(row.amountUsd)
}

export function debitCountsForScope(
  row: DebitUsageRow,
  scope: CreditScope,
): boolean {
  return debitAmountForScope(row, scope) > 0
}

/** purpose is `inference:<model>` from inference-api; fall back to raw purpose. */
export function modelFromPurpose(purpose: string | null | undefined): string {
  const p = (purpose || '').trim()
  if (!p) return 'unknown'
  if (p.startsWith('inference:')) {
    const model = p.slice('inference:'.length).trim()
    return model || 'inference'
  }
  return p
}

function startOfUtcHour(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      0,
      0,
      0,
    ),
  )
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  )
}

/** ISO week bucket: Monday 00:00 UTC of the week containing d. */
function startOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d)
  const dow = day.getUTCDay() // 0 Sun … 6 Sat
  const offset = dow === 0 ? -6 : 1 - dow
  day.setUTCDate(day.getUTCDate() + offset)
  return day
}

export function bucketStart(
  d: Date,
  granularity: Granularity,
): Date {
  if (granularity === 'hour') return startOfUtcHour(d)
  if (granularity === 'week') return startOfUtcWeek(d)
  return startOfUtcDay(d)
}

function advanceBucket(d: Date, granularity: Granularity): Date {
  const next = new Date(d.getTime())
  if (granularity === 'hour') {
    next.setUTCHours(next.getUTCHours() + 1)
  } else if (granularity === 'week') {
    next.setUTCDate(next.getUTCDate() + 7)
  } else {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

export function buildBuckets(
  from: Date,
  to: Date,
  granularity: Granularity,
): string[] {
  const out: string[] = []
  let cursor = bucketStart(from, granularity)
  const end = to.getTime()
  // Cap to avoid runaway custom ranges
  const maxBuckets =
    granularity === 'hour' ? 24 * 40 : granularity === 'week' ? 60 : 400
  while (cursor.getTime() <= end && out.length < maxBuckets) {
    out.push(cursor.toISOString())
    cursor = advanceBucket(cursor, granularity)
  }
  return out
}

function emptyPoint(t: string): UsagePoint {
  return {
    t,
    spendUsd: 0,
    creditsUsd: 0,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReads: 0,
    cacheWrites: 0,
    totalTokens: 0,
  }
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const s = n.toFixed(6)
  return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') || '0'
}

export function buildUsageReport(
  rows: DebitUsageRow[],
  opts: {
    from: Date
    to: Date
    granularity: Granularity
    creditScope: CreditScope
    groupBy?: UsageGroupBy
  },
): UsageReport {
  const creditScope = opts.creditScope
  const granularity = opts.granularity
  const groupBy = opts.groupBy || 'model'
  const buckets = buildBuckets(opts.from, opts.to, granularity)
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]))

  type Acc = Map<string, UsagePoint[]>
  const byGroup: Acc = new Map()

  let spend = 0
  let requests = 0

  for (const row of rows) {
    const amount = debitAmountForScope(row, creditScope)
    if (!(amount > 0)) continue
    const t = bucketStart(row.createdAt, granularity).toISOString()
    if (!bucketIndex.has(t)) continue

    const id = groupBy === 'model' ? modelFromPurpose(row.purpose) : 'all'
    let points = byGroup.get(id)
    if (!points) {
      points = buckets.map((b) => emptyPoint(b))
      byGroup.set(id, points)
    }
    const idx = bucketIndex.get(t)!
    const p = points[idx]!
    p.spendUsd += amount
    p.creditsUsd += amount
    p.requests += 1

    spend += amount
    requests += 1
  }

  const series: UsageSeries[] = [...byGroup.entries()]
    .map(([id, points]) => ({
      id,
      label: id,
      points,
    }))
    .sort((a, b) => {
      const sa = a.points.reduce((s, p) => s + p.spendUsd, 0)
      const sb = b.points.reduce((s, p) => s + p.spendUsd, 0)
      return sb - sa
    })

  return {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    granularity,
    creditScope,
    groupBy,
    totals: {
      spendUsd: fmtUsd(spend),
      creditsUsd: fmtUsd(spend),
      requests,
      inputTokens: 0,
      outputTokens: 0,
      cacheReads: 0,
      cacheWrites: 0,
      totalTokens: 0,
    },
    buckets,
    series,
  }
}

export function parseCreditScope(raw: string | null): CreditScope {
  if (raw === 'api' || raw === 'subscription') return raw
  return 'all'
}

export function parseGranularity(raw: string | null): Granularity {
  if (raw === 'hour' || raw === 'weekly' || raw === 'week') {
    return raw === 'weekly' ? 'week' : raw === 'week' ? 'week' : 'hour'
  }
  if (raw === 'hourly') return 'hour'
  if (raw === 'daily' || raw === 'day') return 'day'
  return 'day'
}
