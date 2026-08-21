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
      const res = await fetch('/api/oauth/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setSessions([])
        return
      }
      const data = (await res.json()) as { sessions?: OAuthLoginSession[] }
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
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
