'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import {
  catalogTierCopy,
  formatCycleDate,
  formatUsdDisplay,
  freeAllowanceUsedUp,
  isFreePlanPayload,
  type BillingStatePayload,
  type SubscriptionStatePayload,
} from '@/lib/billing-client'
import styles from './BillingPage.module.css'

export function BillingPage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [searchParams, setSearchParams] = useSearchParams()
  const topupOpen = searchParams.get('topup') === 'open'
  const manageOpen = searchParams.get('manage') === '1'
  const cardSaved = searchParams.get('card') === 'saved'
  const planUpgraded = searchParams.get('plan') === 'upgraded'
  const preselectPlan = searchParams.get('plan')

  const [billing, setBilling] = useState<BillingStatePayload | null>(null)
  const [subscription, setSubscription] =
    useState<SubscriptionStatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const load = useCallback(async () => {
    if (!authenticated) {
      setBilling(null)
      setSubscription(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const [bRes, sRes] = await Promise.all([
        fetch('/api/billing/state', { headers }),
        fetch('/api/billing/subscription', { headers }),
      ])
      if (bRes.ok) {
        const data = (await bRes.json()) as BillingStatePayload
        setBilling(data)
        if (data.chargePresets?.length) setSelectedPreset(data.chargePresets[0])
      } else setBilling(null)
      if (sRes.ok) {
        setSubscription((await sRes.json()) as SubscriptionStatePayload)
      } else setSubscription(null)
    } catch {
      setBilling(null)
      setSubscription(null)
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  useEffect(() => {
    if (cardSaved) {
      setFlash('Cartão guardado')
      const next = new URLSearchParams(searchParams)
      next.delete('card')
      setSearchParams(next, { replace: true })
      void load()
    }
  }, [cardSaved, load, searchParams, setSearchParams])

  useEffect(() => {
    if (planUpgraded) {
      setFlash('Plano atualizado')
      const next = new URLSearchParams(searchParams)
      next.delete('plan')
      setSearchParams(next, { replace: true })
      void load()
    }
  }, [planUpgraded, load, searchParams, setSearchParams])

  function setQuery(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value == null) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (preselectPlan && preselectPlan !== 'upgraded' && !manageOpen) {
      setQuery('manage', '1')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectPlan])

  async function upgradeTier(tierId: string) {
    setBusy(`upgrade:${tierId}`)
    setFlash(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const hasPaid = Boolean(subscription?.current)
      if (!hasPaid) {
        const res = await fetch('/api/billing/subscription/checkout', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionTypeId: tierId,
            returnPath: `/orgs/${billing?.org.slug}/billing?plan=upgraded`,
          }),
        })
        const data = (await res.json()) as { url?: string; error?: string; message?: string }
        if (data.url) {
          window.location.href = data.url
          return
        }
        setFlash(data.message || data.error || 'Falha no Checkout')
        return
      }
      const key = crypto.randomUUID()
      const res = await fetch('/api/billing/subscription/upgrade', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ subscriptionTypeId: tierId }),
      })
      const data = (await res.json()) as {
        status?: string
        targetTierName?: string
        reason?: string
        error?: string
        message?: string
      }
      if (data.status === 'upgraded' || data.status === 'already_on_tier') {
        setFlash(
          data.status === 'already_on_tier'
            ? `Já estás no ${data.targetTierName}`
            : `Upgrade para ${data.targetTierName} concluído`,
        )
        await load()
        return
      }
      if (data.status === 'requires_action') {
        const cRes = await fetch('/api/billing/subscription/checkout', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionTypeId: tierId }),
        })
        const cData = (await cRes.json()) as { url?: string; error?: string }
        if (cData.url) {
          window.location.href = cData.url
          return
        }
      }
      setFlash(data.message || data.error || data.reason || 'Upgrade falhou')
    } finally {
      setBusy(null)
    }
  }

  async function scheduleDowngrade(tierId: string) {
    setBusy(`down:${tierId}`)
    setFlash(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/billing/subscription/pending-change', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tier_change',
          subscriptionTypeId: tierId,
        }),
      })
      const data = (await res.json()) as {
        message?: string
        error?: string
        targetTierName?: string
      }
      if (!res.ok) {
        setFlash(data.message || data.error || 'Não foi possível agendar')
        return
      }
      setFlash(data.message || `Mudança para ${data.targetTierName} agendada`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function addCard() {
    setBusy('card')
    setFlash(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/billing/payment-method/setup', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setFlash(data.error || 'Falha ao abrir Stripe')
    } finally {
      setBusy(null)
    }
  }

  async function confirmTopup() {
    if (!selectedPreset || !billing?.card) return
    setBusy('charge')
    setFlash(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const key = crypto.randomUUID()
      const res = await fetch('/api/billing/charge', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ amountUsd: Number(selectedPreset) }),
      })
      const data = (await res.json()) as {
        chargeId?: string
        error?: string
        portalUrl?: string
      }
      if (!res.ok || !data.chargeId) {
        if (data.error === 'no_payment_method') {
          setFlash('Adiciona um cartão primeiro')
          return
        }
        setFlash(data.error || 'Cobrança falhou')
        return
      }
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 800))
        const st = await fetch(`/api/billing/charge/${data.chargeId}`, {
          headers,
        })
        const body = (await st.json()) as {
          status?: string
          reason?: string
        }
        if (body.status === 'settled') {
          setFlash(`+${formatUsdDisplay(selectedPreset)}`)
          setQuery('topup', null)
          await load()
          return
        }
        if (body.status === 'failed') {
          setFlash(body.reason || 'Cobrança falhou')
          return
        }
      }
      setFlash('A processar')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function toggleAutoReload() {
    if (!billing) return
    setBusy('auto')
    try {
      const headers = await authHeaders()
      if (!headers) return
      const enabling = !billing.autoReload.enabled
      const res = await fetch('/api/billing/auto-top-up', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          enabling
            ? { enabled: true, threshold: 5, topUpAmount: 25 }
            : { enabled: false, threshold: 0, topUpAmount: 0 },
        ),
      })
      if (res.ok) await load()
    } finally {
      setBusy(null)
    }
  }

  const isFree = isFreePlanPayload(billing, subscription)
  const lowBalance = useMemo(() => {
    if (!billing || isFreePlanPayload(billing, subscription)) return false
    return Number(billing.balanceUsd) < 5
  }, [billing, subscription])

  const cycleLabel = formatCycleDate(billing?.cycleEndsAt ?? null)
  const total = Number(billing?.balanceUsd || 0)
  const spent = Number(billing?.spentThisPeriodUsd || 0)
  const barTotal = Math.max(total + spent, 0.01)
  const fillPct = Math.min(100, Math.round((total / barTotal) * 100))
  const allowanceUsed = freeAllowanceUsedUp(billing?.balanceUsd)

  return (
    <div className={styles.wrap}>
      <OrgPage eyebrow="Billing" title="Billing">
        {flash ? <p className={styles.flash}>{flash}</p> : null}

        <section className={styles.hero}>
          <p className={styles.heroBalance}>
            {loading ? '…' : isFree ? 'Free' : formatUsdDisplay(billing?.balanceUsd || '0')}
          </p>
          {lowBalance && !loading ? (
            <p className={styles.low}>Saldo baixo</p>
          ) : null}
        </section>

        <section className={styles.card} aria-labelledby="breakdown-title">
          <div className={styles.cardHead}>
            <h2 id="breakdown-title" className={styles.cardTitle}>
              Detalhe do saldo
            </h2>
            <span className={styles.cycle}>
              {isFree ? `Reinicia ${cycleLabel}` : `Ciclo até ${cycleLabel}`}
            </span>
          </div>

          <div className={styles.barTrack} aria-hidden>
            <div className={styles.barFill} style={{ width: `${fillPct}%` }} />
            {spent > 0 && !isFree ? (
              <span className={styles.barSpent}>
                −{formatUsdDisplay(String(spent))}
              </span>
            ) : null}
          </div>

          {isFree ? (
            <ul className={styles.rows}>
              <li>
                <span className={`${styles.dot} ${styles.dotBlue}`} />
                <div className={styles.rowMain}>
                  <strong>Allowance deste mês</strong>
                  <span className={styles.rowMeta}>Reinicia {cycleLabel}</span>
                </div>
                <div className={styles.rowRight}>
                  <strong>
                    {allowanceUsed ? 'Usada neste ciclo' : 'Disponível'}
                  </strong>
                </div>
              </li>
            </ul>
          ) : (
          <ul className={styles.rows}>
            <li>
              <span className={`${styles.dot} ${styles.dotGreen}`} />
              <div className={styles.rowMain}>
                <strong>Créditos avulsos</strong>
                <span className={styles.rowMeta}>
                  {billing?.lastTopupAt
                    ? `Última compra: ${formatCycleDate(billing.lastTopupAt)}`
                    : 'Sem compras'}
                </span>
              </div>
              <div className={styles.rowRight}>
                <strong>
                  {formatUsdDisplay(billing?.purchasedCreditsUsd || '0')}
                </strong>
                <span className={styles.rowMeta}>Não expiram</span>
              </div>
            </li>
            <li>
              <span className={`${styles.dot} ${styles.dotBlue}`} />
              <div className={styles.rowMain}>
                <strong>Créditos da subscrição</strong>
                <span className={styles.rowMeta}>
                  {formatUsdDisplay(
                    subscription?.current?.monthlyCredits ||
                      billing?.subscriptionCreditsUsd ||
                      '0',
                  )}{' '}
                  neste período
                </span>
              </div>
              <div className={styles.rowRight}>
                <strong>
                  {formatUsdDisplay(billing?.subscriptionCreditsUsd || '0')}
                </strong>
                <span className={styles.rowMeta}>Até {cycleLabel}</span>
              </div>
            </li>
            <li>
              <span className={`${styles.dot} ${styles.dotDashed}`} />
              <div className={styles.rowMain}>
                <strong>Gasto neste período</strong>
                <Link className={styles.usageLink} to="../usage">
                  Uso detalhado
                </Link>
              </div>
              <div className={styles.rowRight}>
                <strong>
                  {formatUsdDisplay(billing?.spentThisPeriodUsd || '0')}
                </strong>
              </div>
            </li>
          </ul>
          )}
        </section>

        <div className={styles.grid2}>
          <section className={styles.card} aria-labelledby="pm-title">
            <h2 id="pm-title" className={styles.cardTitle}>
              Método de pagamento
            </h2>
            {billing?.card ? (
              <div className={styles.pmRow}>
                <span>
                  {billing.card.brand} ···· {billing.card.last4}
                </span>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={busy === 'card'}
                  onClick={() => void addCard()}
                >
                  Atualizar
                </button>
              </div>
            ) : (
              <div className={styles.pmRow}>
                <span className={styles.muted}>Sem cartão</span>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy === 'card' || !billing?.canChangePlan}
                  onClick={() => void addCard()}
                >
                  {busy === 'card' ? '…' : 'Adicionar'}
                </button>
              </div>
            )}
          </section>

          <section className={styles.card} aria-labelledby="sub-title">
            <h2 id="sub-title" className={styles.cardTitle}>
              Subscrição
            </h2>
            <div className={styles.planRow}>
              <div>
                <p className={styles.planName}>
                  {isFree
                    ? 'Free'
                    : subscription?.current?.tierName || billing?.planName || 'Free'}
                </p>
                {isFree ? (
                  <p className={styles.rowMeta}>
                    {cycleLabel !== '—'
                      ? `Allowance reinicia ${cycleLabel}`
                      : 'Free'}
                  </p>
                ) : (
                  <>
                    <p className={styles.rowMeta}>
                      {formatUsdDisplay(
                        subscription?.tiers.find((t) => t.isCurrent)
                          ?.dollarsPerMonthDisplay || '0',
                      )}
                      /mês ·{' '}
                      {formatUsdDisplay(
                        subscription?.current?.monthlyCredits || '0',
                      )}{' '}
                      créditos
                    </p>
                    <p className={styles.rowMeta}>Renova {cycleLabel}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                className={styles.ghost}
                disabled={!billing?.canChangePlan}
                onClick={() => setQuery('manage', manageOpen ? null : '1')}
              >
                Gerir plano
              </button>
            </div>
          </section>
        </div>

        <section className={styles.card} aria-labelledby="topup-title">
          <div className={styles.cardHead}>
            <h2 id="topup-title" className={styles.cardTitle}>
              Créditos avulsos
            </h2>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={!billing?.canChangePlan}
              onClick={() => setQuery('topup', topupOpen ? null : 'open')}
            >
              Recarregar agora
            </button>
          </div>

          {topupOpen ? (
            <div className={styles.topupPanel}>
              <div className={styles.presets} role="group" aria-label="Valores">
                {(billing?.chargePresets || []).map((p) => (
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
              {!billing?.card ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy === 'card'}
                  onClick={() => void addCard()}
                >
                  Adicionar cartão
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy === 'charge' || !selectedPreset}
                  onClick={() => void confirmTopup()}
                >
                  {busy === 'charge'
                    ? '…'
                    : `Confirmar ${selectedPreset ? formatUsdDisplay(selectedPreset) : ''}`}
                </button>
              )}
            </div>
          ) : null}

          <div className={styles.autoBlock}>
            <div>
              <strong>Recarga automática</strong>
              <p className={styles.rowMeta}>
                {billing?.autoReload.enabled
                  ? `${formatUsdDisplay(billing.autoReload.thresholdUsd || '0')} → ${formatUsdDisplay(billing.autoReload.reloadToUsd || '0')}`
                  : 'Desligada'}
              </p>
            </div>
            <button
              type="button"
              className={styles.ghost}
              disabled={!billing?.card || !billing?.canChangePlan || busy === 'auto'}
              onClick={() => void toggleAutoReload()}
            >
              {billing?.autoReload.enabled ? 'Desligar' : 'Ativar'}
            </button>
          </div>
        </section>

        {manageOpen && subscription ? (
          <section className={styles.card} aria-labelledby="manage-title">
            <div className={styles.cardHead}>
              <h2 id="manage-title" className={styles.cardTitle}>
                Gerir plano
              </h2>
              <button
                type="button"
                className={styles.close}
                onClick={() => setQuery('manage', null)}
              >
                Fechar
              </button>
            </div>
            <p className={styles.rowMeta}>
              Pagamento: Stripe
              {billing?.card
                ? ` · ${billing.card.brand} ···· ${billing.card.last4}`
                : ''}
            </p>
            <ul className={styles.tierList}>
              {subscription.tiers.map((t) => {
                const currentOrder =
                  subscription.tiers.find((x) => x.isCurrent)?.tierOrder ?? 0
                const isDowngrade =
                  Boolean(subscription.current) && t.tierOrder < currentOrder
                const copy = catalogTierCopy(t)
                return (
                  <li key={t.tierId}>
                    <div>
                      <strong>{copy.title}</strong>
                      {copy.bonus ? (
                        <span className={styles.bonus}>{copy.bonus}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={
                        t.isCurrent ||
                        Boolean(busy) ||
                        !billing?.canChangePlan
                      }
                      onClick={() => {
                        if (isDowngrade) {
                          void scheduleDowngrade(t.tierId)
                          return
                        }
                        void upgradeTier(t.tierId)
                      }}
                    >
                      {busy === `upgrade:${t.tierId}` || busy === `down:${t.tierId}`
                        ? '…'
                        : t.isCurrent
                          ? 'Atual'
                          : isDowngrade
                            ? 'Agendar'
                            : 'Upgrade'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </OrgPage>
    </div>
  )
}
