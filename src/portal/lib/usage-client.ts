/**
 * Client helpers for Portal Usage (Hermes-shaped controls over /api/billing/usage).
 */

export type CreditScope = 'all' | 'api' | 'subscription'
export type Granularity = 'hour' | 'day' | 'week'
export type ChartStyle = 'line' | 'bar'
export type TimePreset = '1h' | '24h' | '7d' | '30d' | '12m' | 'custom'

export type UsageMetric =
  | 'spend'
  | 'credits'
  | 'requests'
  | 'total_tokens'
  | 'input_tokens'
  | 'output_tokens'
  | 'cache_reads'
  | 'cache_writes'

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

export type UsagePayload = {
  from: string
  to: string
  granularity: Granularity
  creditScope: CreditScope
  groupBy: string
  totals: UsageTotals
  buckets: string[]
  series: UsageSeries[]
}

export function rangeForPreset(
  preset: Exclude<TimePreset, 'custom'>,
  now = new Date(),
): { from: Date; to: Date } {
  const to = now
  const ms =
    preset === '1h'
      ? 60 * 60 * 1000
      : preset === '24h'
        ? 24 * 60 * 60 * 1000
        : preset === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : preset === '30d'
            ? 30 * 24 * 60 * 60 * 1000
            : 365 * 24 * 60 * 60 * 1000
  return { from: new Date(to.getTime() - ms), to }
}

export function shiftRange(
  from: Date,
  to: Date,
  direction: -1 | 1,
): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime()
  return {
    from: new Date(from.getTime() + direction * span),
    to: new Date(to.getTime() + direction * span),
  }
}

export function pointValue(point: UsagePoint, metric: UsageMetric): number {
  switch (metric) {
    case 'spend':
      return point.spendUsd
    case 'credits':
      return point.creditsUsd
    case 'requests':
      return point.requests
    case 'total_tokens':
      return point.totalTokens
    case 'input_tokens':
      return point.inputTokens
    case 'output_tokens':
      return point.outputTokens
    case 'cache_reads':
      return point.cacheReads
    case 'cache_writes':
      return point.cacheWrites
    default:
      return 0
  }
}

export function formatMetricValue(
  metric: UsageMetric,
  value: number | string,
): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '—'
  if (metric === 'spend' || metric === 'credits') {
    if (n === 0) return '$0'
    if (Math.abs(n) < 0.01) return `$${n.toFixed(6)}`.replace(/0+$/, '').replace(/\.$/, '')
    return `$${n.toFixed(6)}`.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  }
  return Math.round(n).toLocaleString('pt-BR')
}

export function formatBucketLabel(iso: string, granularity: Granularity): string {
  try {
    const d = new Date(iso)
    if (granularity === 'hour') {
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    if (granularity === 'week') {
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return iso
  }
}

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(raw: string): Date | null {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

const SERIES_COLORS = [
  '#5b4fcf',
  '#2f9e6b',
  '#2f6fed',
  '#c43c3c',
  '#c47a1a',
  '#0f766e',
  '#7c3aed',
  '#be185d',
]

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!
}

export function buildCsv(payload: UsagePayload, metric: UsageMetric): string {
  const headers = ['bucket', ...payload.series.map((s) => s.label)]
  const lines = [headers.join(',')]
  for (let i = 0; i < payload.buckets.length; i++) {
    const row = [
      payload.buckets[i],
      ...payload.series.map((s) => {
        const p = s.points[i]
        return p ? String(pointValue(p, metric)) : '0'
      }),
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}
