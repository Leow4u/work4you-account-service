'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { formatUsdDisplay, isFreePlanPayload } from '@/lib/billing-client'
import { displayName } from '../lib/auth-display'
import { PORTAL_NAV, navPath } from '../lib/portal-nav'
import styles from './PortalShell.module.css'

export function PortalShell() {
  const { orgId = '' } = useParams()
  const { user, logout, getAccessToken, authenticated } = usePrivy()
  const navigate = useNavigate()
  const name = user ? displayName(user) : 'Conta'
  const [balance, setBalance] = useState<string | null>(null)
  const [planFree, setPlanFree] = useState(false)

  const loadBalance = useCallback(async () => {
    if (!authenticated) {
      setBalance(null)
      setPlanFree(false)
      return
    }
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/billing/state', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        balanceUsd?: string
        planName?: string
        subscriptionTierId?: string
      }
      if (typeof data.balanceUsd === 'string') setBalance(data.balanceUsd)
      setPlanFree(
        isFreePlanPayload({
          planName: data.planName || '',
          subscriptionTierId: data.subscriptionTierId || '',
        }),
      )
    } catch {
      /* keep previous */
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    void loadBalance()
  }, [loadBalance])

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Portal">
        <div className={styles.brandRow}>
          <a className={styles.brand} href="https://work4you.ai/" aria-label="Work4You">
            <img src="/brand/work4you-logo.png" alt="Work4You" width={140} height={14} />
          </a>
        </div>

        <div className={styles.account}>
          <p className={styles.accountName}>{name}</p>
          <p className={styles.accountMeta}>Conta pessoal</p>
        </div>

        <div className={styles.balance} aria-label={planFree ? 'Plano' : 'Saldo'}>
          <span className={styles.balanceLabel}>{planFree ? 'Plano' : 'Saldo'}</span>
          <span className={styles.balanceValue}>
            {balance == null ? '…' : planFree ? 'Free' : formatUsdDisplay(balance)}
          </span>
          <button
            type="button"
            className={styles.buyBtn}
            onClick={() => navigate(`/orgs/${orgId}/billing?topup=open`)}
          >
            Comprar créditos
          </button>
        </div>

        <nav className={styles.nav} aria-label="Secções">
          {PORTAL_NAV.map((item) => (
            <NavLink
              key={item.id}
              to={navPath(orgId, item.segment)}
              end={item.segment === ''}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <a
            className={styles.footLink}
            href="https://work4you.ai/docs/"
            target="_blank"
            rel="noreferrer"
          >
            API Docs
          </a>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <Outlet context={{ refreshBalance: loadBalance }} />
      </div>
    </div>
  )
}
