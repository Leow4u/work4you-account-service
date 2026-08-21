'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { OrgPage } from '../../components/OrgPage'
import {
  buildCsv,
  formatBucketLabel,
  formatMetricValue,
  fromLocalInputValue,
  pointValue,
  rangeForPreset,
  seriesColor,
  shiftRange,
  toLocalInputValue,
  type ChartStyle,
  type CreditScope,
  type Granularity,
  type TimePreset,
  type UsageMetric,
  type UsagePayload,
} from '../../lib/usage-client'
import styles from './UsagePage.module.css'

const CREDIT_TABS: { id: CreditScope; label: string }[] = [
  { id: 'all', label: 'Todos os créditos' },
  { id: 'api', label: 'Só créditos de API' },
  { id: 'subscription', label: 'Só créditos da subscrição' },
]

const METRICS: { id: UsageMetric; label: string }[] = [
  { id: 'spend', label: 'Gasto' },
  { id: 'credits', label: 'Créditos' },
  { id: 'requests', label: 'Pedidos' },
  { id: 'total_tokens', label: 'Tokens totais' },
  { id: 'input_tokens', label: 'Tokens de entrada' },
  { id: 'output_tokens', label: 'Tokens de saída' },
  { id: 'cache_reads', label: 'Leituras de cache' },
  { id: 'cache_writes', label: 'Escritas de cache' },
]

const PRESETS: { id: Exclude<TimePreset, 'custom'>; label: string }[] = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '12m', label: '12m' },
]

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'hour', label: 'horária' },
  { id: 'day', label: 'diária' },
  { id: 'week', label: 'semanal' },
]

function yAxisLabel(metric: UsageMetric): string {
  if (metric === 'spend' || metric === 'credits') return 'Gasto ($)'
  if (metric === 'requests') return 'Pedidos'
  return 'Tokens'
}

function UsageChart({
  payload,
  metric,
  style,
}: {
  payload: UsagePayload
  metric: UsageMetric
  style: ChartStyle
}) {
  const width = 920
  const height = 320
  const pad = { top: 16, right: 16, bottom: 36, left: 56 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const buckets = payload.buckets
  const n = Math.max(buckets.length, 1)

  const maxY = useMemo(() => {
    let m = 0
    for (const s of payload.series) {
      for (const p of s.points) {
        m = Math.max(m, pointValue(p, metric))
      }
    }
    if (m <= 0) return 1
    const exp = Math.pow(10, Math.floor(Math.log10(m)))
    return Math.ceil(m / exp) * exp
  }, [payload.series, metric])

  const xAt = (i: number) =>
    pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => pad.top + innerH - (v / maxY) * innerH

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
  const labelEvery = Math.max(1, Math.ceil(n / 8))

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Gráfico de utilização"
    >
      {gridTicks.map((tick) => {
        const y = yAt(tick)
        return (
          <g key={tick}>
            <line
              className={styles.gridLine}
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
            />
            <text
              className={styles.axisLabel}
              x={pad.left - 8}
              y={y + 3}
              textAnchor="end"
            >
              {formatMetricValue(metric, tick)}
            </text>
          </g>
        )
      })}

      {buckets.map((b, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text
            key={b}
            className={styles.axisLabel}
            x={xAt(i)}
            y={height - 10}
            textAnchor="middle"
          >
            {formatBucketLabel(b, payload.granularity)}
          </text>
        ) : null,
      )}

      {style === 'bar'
        ? payload.series.map((series, sIdx) => {
            const groupW = innerW / n
            const barW = Math.max(
              2,
              (groupW * 0.7) / Math.max(payload.series.length, 1),
            )
            const offset =
              -((payload.series.length - 1) * barW) / 2 + sIdx * barW
            return series.points.map((p, i) => {
              const v = pointValue(p, metric)
              const y = yAt(v)
              const x = xAt(i) + offset - barW / 2
              return (
                <rect
                  key={`${series.id}-${i}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(0, pad.top + innerH - y)}
                  fill={seriesColor(sIdx)}
                  opacity={0.85}
                />
              )
            })
          })
        : payload.series.map((series, sIdx) => {
            const d = series.points
              .map((p, i) => {
                const x = xAt(i)
                const y = yAt(pointValue(p, metric))
                return `${i === 0 ? 'M' : 'L'}${x},${y}`
              })
              .join(' ')
            return (
              <path
                key={series.id}
                d={d}
                fill="none"
                stroke={seriesColor(sIdx)}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )
          })}
    </svg>
  )
}

/**
 * Usage analytics — Hermes layout, fed by existing BillingDebit ledger
 * via GET /api/billing/usage (spend / requests / model / credit scope).
 */
export function UsagePage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [creditScope, setCreditScope] = useState<CreditScope>('all')
  const [metric, setMetric] = useState<UsageMetric>('spend')
  const [preset, setPreset] = useState<TimePreset>('7d')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line')
  const [from, setFrom] = useState(() => rangeForPreset('7d').from)
  const [to, setTo] = useState(() => rangeForPreset('7d').to)
  const [payload, setPayload] = useState<UsagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = useCallback((id: Exclude<TimePreset, 'custom'>) => {
    const range = rangeForPreset(id)
    setPreset(id)
    setFrom(range.from)
    setTo(range.to)
  }, [])

  const load = useCallback(async () => {
    if (!authenticated) {
      setPayload(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const q = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        granularity,
        creditScope,
        groupBy: 'model',
      })
      const res = await fetch(`/api/billing/usage?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setPayload(null)
        setError('Não foi possível carregar a utilização.')
        return
      }
      setPayload((await res.json()) as UsagePayload)
    } catch {
      setPayload(null)
      setError('Não foi possível carregar a utilização.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken, from, to, granularity, creditScope])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  const totals = payload?.totals

  function exportCsv() {
    if (!payload) return
    const csv = buildCsv(payload, metric)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `work4you-usage-${payload.from.slice(0, 10)}_${payload.to.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.wrap}>
      <OrgPage
        eyebrow="Usage"
        title="Utilização"
        lead="Gasto, pedidos e tokens do período a partir dos débitos de inference — o mesmo ledger que alimenta Billing e /usage."
      >
        <div className={styles.creditTabs} role="tablist" aria-label="Tipo de crédito">
          {CREDIT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={creditScope === tab.id}
              className={`${styles.tab} ${creditScope === tab.id ? styles.tabActive : ''}`}
              onClick={() => setCreditScope(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.cards}>
          {(
            [
              ['spend', 'Gasto', totals?.spendUsd ?? '0'],
              ['input_tokens', 'Tokens de entrada', totals?.inputTokens ?? 0],
              ['output_tokens', 'Tokens de saída', totals?.outputTokens ?? 0],
              ['cache_reads', 'Leituras de cache', totals?.cacheReads ?? 0],
              ['cache_writes', 'Escritas de cache', totals?.cacheWrites ?? 0],
              ['requests', 'Pedidos', totals?.requests ?? 0],
            ] as const
          ).map(([id, label, value]) => (
            <div key={id} className={styles.card}>
              <p className={styles.cardLabel}>{label}</p>
              <p className={styles.cardValue}>
                {formatMetricValue(id, value)}
              </p>
            </div>
          ))}
        </div>

        <section className={styles.filters} aria-label="Filtros">
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Métrica</span>
            <div className={styles.chipGroup}>
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.chip} ${metric === m.id ? styles.chipActive : ''}`}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Intervalo</span>
            <div className={styles.chipGroup}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.chip} ${preset === p.id ? styles.chipActive : ''}`}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${preset === 'custom' ? styles.chipActive : ''}`}
                onClick={() => setPreset('custom')}
              >
                Personalizado
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Período anterior"
                onClick={() => {
                  const next = shiftRange(from, to, -1)
                  setPreset('custom')
                  setFrom(next.from)
                  setTo(next.to)
                }}
              >
                ←
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Período seguinte"
                onClick={() => {
                  const next = shiftRange(from, to, 1)
                  setPreset('custom')
                  setFrom(next.from)
                  setTo(next.to)
                }}
              >
                →
              </button>
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Datas</span>
            <input
              className={styles.dateInput}
              type="datetime-local"
              value={toLocalInputValue(from)}
              onChange={(e) => {
                const d = fromLocalInputValue(e.target.value)
                if (!d) return
                setPreset('custom')
                setFrom(d)
              }}
            />
            <span className={styles.muted}>→</span>
            <input
              className={styles.dateInput}
              type="datetime-local"
              value={toLocalInputValue(to)}
              onChange={(e) => {
                const d = fromLocalInputValue(e.target.value)
                if (!d) return
                setPreset('custom')
                setTo(d)
              }}
            />
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Granularidade</span>
            <div className={styles.chipGroup}>
              {GRANULARITIES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`${styles.chip} ${granularity === g.id ? styles.chipActive : ''}`}
                  onClick={() => setGranularity(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Agrupar</span>
            <select className={styles.select} value="model" disabled>
              <option value="model">por modelo</option>
            </select>
            <span className={styles.filterLabel}>Gráfico</span>
            <div className={styles.chipGroup}>
              <button
                type="button"
                className={`${styles.chip} ${chartStyle === 'line' ? styles.chipActive : ''}`}
                onClick={() => setChartStyle('line')}
                aria-label="Linha"
              >
                Linha
              </button>
              <button
                type="button"
                className={`${styles.chip} ${chartStyle === 'bar' ? styles.chipActive : ''}`}
                onClick={() => setChartStyle('bar')}
                aria-label="Barras"
              >
                Barras
              </button>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={exportCsv}
              disabled={!payload}
            >
              Exportar CSV
            </button>
          </div>
        </section>

        <section className={styles.chartPanel} aria-label="Gráfico">
          <div className={styles.chartHead}>
            <p className={styles.muted}>{yAxisLabel(metric)}</p>
            {payload && payload.series.length > 0 ? (
              <ul className={styles.legend}>
                {payload.series.map((s, i) => (
                  <li key={s.id} className={styles.legendItem}>
                    <span
                      className={styles.swatch}
                      style={{ background: seriesColor(i) }}
                    />
                    {s.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {loading ? (
            <p className={styles.empty}>Carregando…</p>
          ) : error ? (
            <p className={styles.empty}>{error}</p>
          ) : !payload || payload.series.length === 0 ? (
            <p className={styles.empty}>
              Sem débitos neste intervalo. Uso da inference aparece aqui assim
              que houver gasto no ledger.
            </p>
          ) : (
            <UsageChart
              payload={payload}
              metric={metric}
              style={chartStyle}
            />
          )}
        </section>
      </OrgPage>
    </div>
  )
}
