'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  catalogTierCopy,
  type BillingStatePayload,
  type SubscriptionStatePayload,
} from '@/lib/billing-client'
import styles from './org/BillingPage.module.css'

/**
 * Fork deep-link: /manage-subscription?org_id=&plan=
 * Free→paid → Stripe Checkout; paid→higher → POST /subscription/upgrade
 * (falls back to Checkout when SCA / no Stripe sub).
 */
export function ManageSubscriptionPage() {
  const { getAccessToken, authenticated, ready, user } = usePrivy()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const orgIdParam = searchParams.get('org_id')
  const planParam = searchParams.get('plan')
  const autoStarted = useRef(false)

  const [billing, setBilling] = useState<BillingStatePayload | null>(null)
  const [subscription, setSubscription] =
    useState<SubscriptionStatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const load = useCallback(async () => {
    if (!authenticated) {
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
      if (bRes.ok) setBilling((await bRes.json()) as BillingStatePayload)
      else setBilling(null)
      if (sRes.ok) {
        setSubscription((await sRes.json()) as SubscriptionStatePayload)
      } else setSubscription(null)
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders])

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      navigate('/login', {
        replace: true,
        state: {
          from: `/manage-subscription${window.location.search}`,
        },
      })
      return
    }
    void load()
  }, [ready, authenticated, load, navigate])

  const billingPath = billing?.org.slug
    ? `/orgs/${billing.org.slug}/billing`
    : '/billing'

  const tiers = useMemo(() => subscription?.tiers ?? [], [subscription])
  const currentOrder = subscription?.current
    ? tiers.find((t) => t.tierId === subscription.current!.tierId)?.tierOrder ?? 0
    : 0

  const startCheckout = useCallback(
    async (tierId: string) => {
      setBusy(tierId)
      setFlash(null)
      try {
        const headers = await authHeaders()
        if (!headers) return
        const res = await fetch('/api/billing/subscription/checkout', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionTypeId: tierId,
            returnPath: `${billingPath}?plan=upgraded`,
          }),
        })
        const data = (await res.json()) as {
          url?: string
          error?: string
          message?: string
        }
        if (data.url) {
          window.location.href = data.url
          return
        }
        setFlash(data.message || data.error || 'Falha ao abrir Checkout')
      } finally {
        setBusy(null)
      }
    },
    [authHeaders, billingPath],
  )

  const startUpgrade = useCallback(
    async (tierId: string) => {
      setBusy(tierId)
      setFlash(null)
      try {
        const headers = await authHeaders()
        if (!headers) return

        if (!subscription?.current) {
          await startCheckout(tierId)
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
          recoveryUrl?: string
          reason?: string
          targetTierName?: string
          error?: string
          message?: string
        }
        if (data.status === 'upgraded' || data.status === 'already_on_tier') {
          setFlash(
            data.status === 'already_on_tier'
              ? `Já estás no ${data.targetTierName || 'plano'}`
              : `Upgrade para ${data.targetTierName} concluído`,
          )
          await load()
          return
        }
        if (
          data.status === 'requires_action' ||
          data.reason === 'authentication_required' ||
          data.reason === 'subscription_payment_intent_requires_action'
        ) {
          await startCheckout(tierId)
          return
        }
        setFlash(data.message || data.error || data.reason || 'Upgrade falhou')
      } finally {
        setBusy(null)
      }
    },
    [authHeaders, load, startCheckout, subscription?.current],
  )

  useEffect(() => {
    if (!planParam || loading || !subscription || autoStarted.current) return
    const match = tiers.find((t) => t.tierId === planParam)
    if (!match || match.isCurrent) return
    if (match.tierOrder <= currentOrder && subscription.current) return
    autoStarted.current = true
    void startUpgrade(planParam)
  }, [
    planParam,
    loading,
    subscription,
    tiers,
    currentOrder,
    startUpgrade,
  ])

  if (!ready || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--grafite)', margin: 0 }}>Carregando…</p>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, color: 'var(--grafite)', fontSize: '0.85rem' }}>
          Work4You Portal
        </p>
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.75rem' }}>
          Gerir subscrição
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--grafite)' }}>
          {billing?.org.name || user?.email?.address || 'Conta'}
          {orgIdParam ? ` · ${orgIdParam.slice(0, 8)}…` : ''}
        </p>
        <p style={{ margin: '0.75rem 0 0' }}>
          <Link to={billingPath}>← Billing</Link>
        </p>
      </header>

      {flash ? <p className={styles.flash}>{flash}</p> : null}

      <section className={styles.card} aria-labelledby="plans-title">
        <div className={styles.cardHead}>
          <h2 id="plans-title" className={styles.cardTitle}>
            Planos
          </h2>
          <span className={styles.cycle}>
            Atual: {subscription?.current?.tierName || billing?.planName || 'Free'}
          </span>
        </div>
        <p className={styles.rowMeta}>
          Pagamento: Stripe
          {billing?.card
            ? ` · ${billing.card.brand} ···· ${billing.card.last4}`
            : ' · sem cartão (Checkout pede cartão)'}
        </p>
        <ul className={styles.tierList}>
          {tiers.map((t) => {
            const isCurrent = t.isCurrent || t.tierId === (subscription?.current?.tierId ?? 'free')
            const isDowngrade = Boolean(subscription?.current) && t.tierOrder < currentOrder
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
                    isCurrent ||
                    Boolean(busy) ||
                    !subscription?.canChangePlan ||
                    isDowngrade
                  }
                  onClick={() => void startUpgrade(t.tierId)}
                >
                  {busy === t.tierId
                    ? '…'
                    : isCurrent
                      ? 'Atual'
                      : isDowngrade
                        ? 'Downgrade no Billing'
                        : 'Upgrade'}
                </button>
              </li>
            )
          })}
        </ul>
        <p className={styles.rowMeta} style={{ marginTop: '1rem' }}>
          Downgrades e cancelamentos: agenda no{' '}
          <Link to={`${billingPath}?manage=1`}>Billing → Gerir plano</Link>.
        </p>
      </section>
    </div>
  )
}
