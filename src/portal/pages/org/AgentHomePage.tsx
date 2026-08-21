'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'
import styles from './AgentHomePage.module.css'

export interface OAuthLoginSession {
  id: string
  app: string
  createdLabel: string
  lastActiveLabel: string
  expiresLabel: string
  remoteSpending: 'granted' | 'not_granted'
}

export function AgentHomePage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [sessions, setSessions] = useState<OAuthLoginSession[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [cliBillingEnabled, setCliBillingEnabled] = useState(true)
  const [canChangePlan, setCanChangePlan] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!authenticated) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setSessions([])
        return
      }
      const headers = { Authorization: `Bearer ${token}` }
      const [sRes, bRes] = await Promise.all([
        fetch('/api/oauth/sessions', { headers }),
        fetch('/api/billing/state', { headers }),
      ])
      if (sRes.ok) {
        const data = (await sRes.json()) as { sessions?: OAuthLoginSession[] }
        setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      } else setSessions([])
      if (bRes.ok) {
        const billing = (await bRes.json()) as {
          cliBillingEnabled?: boolean
          canChangePlan?: boolean
        }
        setCliBillingEnabled(Boolean(billing.cliBillingEnabled))
        setCanChangePlan(Boolean(billing.canChangePlan))
      }
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  async function revoke(id: string) {
    setRevoking(id)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/oauth/sessions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id))
      }
    } finally {
      setRevoking(null)
    }
  }

  async function toggleRemoteSpending() {
    setToggling(true)
    setFlash(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const next = !cliBillingEnabled
      const res = await fetch('/api/billing/remote-spending', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: next }),
      })
      const data = (await res.json()) as {
        cliBillingEnabled?: boolean
        message?: string
        error?: string
      }
      if (!res.ok) {
        setFlash(data.error || 'Falha ao atualizar')
        return
      }
      setCliBillingEnabled(Boolean(data.cliBillingEnabled))
      setFlash(data.message || null)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <OrgPage eyebrow="Work4You Agent" title="Work4You Agent">
        <div className={styles.intro}>
          <a
            className={styles.visit}
            href="https://work4you.ai/"
            target="_blank"
            rel="noreferrer"
          >
            Visitar Work4You Agent →
          </a>
        </div>

        {flash ? <p className={styles.flash}>{flash}</p> : null}

        <section className={pageStyles.panel} aria-labelledby="remote-heading">
          <h2 id="remote-heading" className={styles.sessionsTitle}>
            Gasto remoto (Remote Spending)
          </h2>
          <p className={styles.remoteCopy}>
            Quando ligado, terminais com scope <code>billing:manage</code> podem
            cobrar o cartão (top-up / upgrade). O fork trata o desligar como{' '}
            <code>cli_billing_disabled</code>.
          </p>
          <div className={styles.remoteRow}>
            <span className={styles.spendBadge}>
              {cliBillingEnabled ? 'Ligado' : 'Desligado'}
            </span>
            <button
              type="button"
              className={styles.signOut}
              disabled={!canChangePlan || toggling || loading}
              onClick={() => void toggleRemoteSpending()}
            >
              {toggling
                ? '…'
                : cliBillingEnabled
                  ? 'Desligar Remote Spending'
                  : 'Ligar Remote Spending'}
            </button>
          </div>
        </section>

        <section className={pageStyles.panel} aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className={styles.sessionsTitle}>
            Sessões
          </h2>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">App</th>
                  <th scope="col">Criado</th>
                  <th scope="col">Última atividade</th>
                  <th scope="col">Expira</th>
                  <th scope="col">Sair</th>
                  <th scope="col">Gasto remoto</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  sessions.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.appCell}>{row.app}</td>
                      <td className={styles.muted}>{row.createdLabel}</td>
                      <td className={styles.muted}>{row.lastActiveLabel}</td>
                      <td className={styles.muted}>{row.expiresLabel}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.signOut}
                          disabled={revoking === row.id}
                          onClick={() => void revoke(row.id)}
                        >
                          Sair
                        </button>
                      </td>
                      <td>
                        <span className={styles.spendBadge}>
                          {row.remoteSpending === 'granted'
                            ? 'Concedido'
                            : 'Não concedido'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </OrgPage>
    </div>
  )
}
