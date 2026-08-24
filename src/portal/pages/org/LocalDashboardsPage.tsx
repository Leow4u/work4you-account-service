'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import styles from './LocalDashboardsPage.module.css'

type DashboardRow = {
  client_id: string
  id: string
  name: string
  kind: 'SELF_HOSTED'
  custom_redirect_uri: string | null
  created_at: string
}

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-PT')
  } catch {
    return iso
  }
}

function redirectLabel(row: DashboardRow): string {
  if (!row.custom_redirect_uri) return 'LOCALHOST ONLY'
  try {
    return new URL(row.custom_redirect_uri).origin
  } catch {
    return row.custom_redirect_uri
  }
}

export function LocalDashboardsPage() {
  const { orgId } = useParams()
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerName, setRegisterName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const orgQuery = orgId ? `?org=${encodeURIComponent(orgId)}` : ''

  const load = useCallback(async () => {
    if (!authenticated) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/oauth/self-hosted-client${orgQuery}`, {
        headers,
      })
      if (!res.ok) {
        setError('Não foi possível carregar os dashboards locais.')
        setRows([])
        return
      }
      const data = (await res.json()) as { dashboards?: DashboardRow[] }
      setRows(Array.isArray(data.dashboards) ? data.dashboards : [])
    } catch {
      setError('Não foi possível contactar o Portal.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders, orgQuery])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  async function copyClientId(clientId: string) {
    try {
      await navigator.clipboard.writeText(clientId)
      setToast(`Copiado — ${clientId}`)
    } catch {
      setToast('Não foi possível copiar.')
    }
  }

  async function registerDashboard() {
    const name = registerName.trim()
    if (!name) return
    setRegistering(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/oauth/self-hosted-client${orgQuery}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = (await res.json().catch(() => ({}))) as DashboardRow & {
        error_description?: string
      }
      if (!res.ok) {
        setError(
          typeof body.error_description === 'string'
            ? body.error_description
            : 'Não foi possível registar o dashboard.',
        )
        return
      }
      setRegisterOpen(false)
      setRegisterName('')
      setToast(`Registado — client ID ${body.client_id}`)
      await load()
    } catch {
      setError('Não foi possível contactar o Portal.')
    } finally {
      setRegistering(false)
    }
  }

  const countLabel = loading
    ? 'A carregar…'
    : rows.length === 0
      ? 'Nenhum dashboard registado.'
      : `${rows.length} dashboard${rows.length === 1 ? '' : 's'}`

  return (
    <OrgPage
      eyebrow="Local Dashboards"
      title="Dashboards locais"
      lead="Registe OAuth client IDs para dashboards Work4You na sua máquina. Copie o agent:{id} para WORK4YOU_DASHBOARD_OAUTH_CLIENT_ID ou use work4you dashboard register."
    >
      <section className={styles.toolbar}>
        <p className={styles.sectionLead}>{countLabel}</p>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setRegisterOpen(true)}
          disabled={!authenticated || loading}
        >
          Registar dashboard
        </button>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      {!loading && rows.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>Nenhum dashboard registado</p>
          <p className={styles.emptyText}>
            Clique em Registar dashboard para obter um OAuth client ID. URIs
            localhost são sempre permitidas; defina um URL público depois com
            work4you dashboard register --redirect-uri ou ao editar o registo.
          </p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>OAuth client ID</th>
                <th>Redirect URI</th>
                <th>Criado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    <div className={styles.clientCell}>
                      <span className={styles.mono}>{row.client_id}</span>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        title="Copiar client ID"
                        onClick={() => void copyClientId(row.client_id)}
                      >
                        ⧉
                      </button>
                    </div>
                  </td>
                  <td>
                    {row.custom_redirect_uri ? (
                      <span className={styles.mono}>
                        {redirectLabel(row)}
                      </span>
                    ) : (
                      <span className={styles.redirectLocal}>
                        LOCALHOST ONLY
                      </span>
                    )}
                  </td>
                  <td>{formatCreated(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {registerOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => !registering && setRegisterOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-labelledby="local-register-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalInner}>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Fechar"
                onClick={() => !registering && setRegisterOpen(false)}
              >
                ×
              </button>
              <p className={styles.modalEyebrow}>{'// MESSAGE'}</p>
              <h3 id="local-register-title" className={styles.modalTitle}>
                Registar dashboard
              </h3>
              <label className={styles.field}>
                <span>Nome do dashboard</span>
                <input
                  className={styles.input}
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="My laptop dashboard"
                  maxLength={64}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void registerDashboard()
                  }}
                />
              </label>
              <p className={styles.modalLead}>
                Receberá um OAuth client ID na tabela após registar. URIs
                localhost são sempre permitidas; defina um URL público depois
                se precisar.
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={registering || !registerName.trim()}
                  onClick={() => void registerDashboard()}
                >
                  {registering ? 'A registar…' : 'Registar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </OrgPage>
  )
}
