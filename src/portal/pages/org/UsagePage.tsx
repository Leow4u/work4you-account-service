'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'
import {
  formatCycleDate,
  formatUsdDisplay,
  type BillingStatePayload,
} from '@/lib/billing-client'

/**
 * Usage overview from live billing balances (fork dollar model).
 * No 7-day telemetry — that is out of scope until inference meters land.
 */
export function UsagePage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [billing, setBilling] = useState<BillingStatePayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!authenticated) {
      setBilling(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/billing/state', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setBilling((await res.json()) as BillingStatePayload)
      else setBilling(null)
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  const sub = Number(billing?.subscriptionCreditsUsd || 0)
  const purchased = Number(billing?.purchasedCreditsUsd || 0)
  const spent = Number(billing?.spentThisPeriodUsd || 0)
  const total = sub + purchased

  return (
    <OrgPage
      eyebrow="Usage"
      title="Utilização"
      lead="Saldos e gasto do período — os mesmos dólares que o CLI/TUI mostram em /usage."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Saldo atual</h2>
        {loading ? (
          <p className={pageStyles.panelText}>Carregando…</p>
        ) : (
          <>
            <p className={pageStyles.panelText}>
              Total spendable:{' '}
              <strong>{formatUsdDisplay(billing?.balanceUsd || '0')}</strong>
              {total > 0 && total < 5 ? ' · saldo baixo' : null}
            </p>
            <ul className={pageStyles.panelText} style={{ paddingLeft: '1.1rem' }}>
              <li>
                Créditos da subscrição:{' '}
                {formatUsdDisplay(billing?.subscriptionCreditsUsd || '0')}
              </li>
              <li>
                Créditos avulsos:{' '}
                {formatUsdDisplay(billing?.purchasedCreditsUsd || '0')}
              </li>
              <li>
                Gasto neste período: {formatUsdDisplay(String(spent))}
              </li>
              <li>
                Ciclo até {formatCycleDate(billing?.cycleEndsAt ?? null)} · plano{' '}
                {billing?.planName || 'Free'}
              </li>
            </ul>
            <p className={pageStyles.panelText}>
              <Link to="../billing">Abrir Billing →</Link>
            </p>
          </>
        )}
      </section>
    </OrgPage>
  )
}
