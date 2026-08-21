'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import {
  formatUsdDisplay,
  type BillingStatePayload,
} from '@/lib/billing-client'
import styles from './BillingPage.module.css'

export function BillingPage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [searchParams, setSearchParams] = useSearchParams()
  const topupOpen = searchParams.get('topup') === 'open'

  const [state, setState] = useState<BillingStatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const load = useCallback(async () => {
    if (!authenticated) {
      setState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setState(null)
        return
      }
      const res = await fetch('/api/billing/state', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setState(null)
        return
      }
      const data = (await res.json()) as BillingStatePayload
      setState(data)
      if (data.chargePresets?.length) {
        setSelectedPreset(data.chargePresets[0])
      }
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  useEffect(() => {
    if (topupOpen) setPanelOpen(true)
  }, [topupOpen])

  function openTopup() {
    setPanelOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('topup', 'open')
    setSearchParams(next, { replace: true })
  }

  function closeTopup() {
    setPanelOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('topup')
    setSearchParams(next, { replace: true })
  }

  const balanceLabel = useMemo(() => {
    if (!state) return '—'
    return formatUsdDisplay(state.balanceUsd)
  }, [state])

  const cardLabel = useMemo(() => {
    if (!state?.card) return 'Sem cartão'
    return `${state.card.brand} ···· ${state.card.last4}`
  }, [state])

  return (
    <div className={styles.wrap}>
      <OrgPage eyebrow="Billing" title="Billing">
        <section className={styles.panel} aria-labelledby="saldo-heading">
          <h2 id="saldo-heading" className={styles.panelTitle}>
            Saldo
          </h2>
          <p className={styles.balance}>{loading ? '…' : balanceLabel}</p>
          <dl className={styles.meta}>
            <div>
              <dt>Cartão</dt>
              <dd>{loading ? '…' : cardLabel}</dd>
            </div>
            <div>
              <dt>Gasto remoto (CLI)</dt>
              <dd>
                {loading
                  ? '…'
                  : state?.cliBillingEnabled
                    ? 'Ativo'
                    : 'Desligado'}
              </dd>
            </div>
            <div>
              <dt>Limite mensal</dt>
              <dd>
                {loading || !state
                  ? '…'
                  : `${formatUsdDisplay(state.monthlyCap.spentThisMonthUsd)} / ${formatUsdDisplay(state.monthlyCap.limitUsd)}`}
              </dd>
            </div>
            <div>
              <dt>Recarga automática</dt>
              <dd>
                {loading
                  ? '…'
                  : state?.autoReload.enabled
                    ? `Ativa · ${formatUsdDisplay(state.autoReload.thresholdUsd || '0')} → ${formatUsdDisplay(state.autoReload.reloadToUsd || '0')}`
                    : 'Desligada'}
              </dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={loading || !state?.canChangePlan}
              onClick={openTopup}
            >
              Comprar créditos
            </button>
          </div>
        </section>

        {panelOpen ? (
          <section className={styles.topup} aria-labelledby="topup-heading">
            <div className={styles.topupHead}>
              <h2 id="topup-heading" className={styles.panelTitle}>
                Comprar créditos
              </h2>
              <button type="button" className={styles.close} onClick={closeTopup}>
                Fechar
              </button>
            </div>
            <div className={styles.presets} role="group" aria-label="Valores">
              {(state?.chargePresets || []).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    selectedPreset === p ? styles.presetActive : styles.preset
                  }
                  onClick={() => setSelectedPreset(p)}
                >
                  {formatUsdDisplay(p)}
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled>
                Confirmar
                {selectedPreset ? ` ${formatUsdDisplay(selectedPreset)}` : ''}
              </button>
            </div>
          </section>
        ) : null}
      </OrgPage>
    </div>
  )
}
