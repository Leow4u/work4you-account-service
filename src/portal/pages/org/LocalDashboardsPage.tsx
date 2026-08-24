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

function baseUrlFromRow(row: DashboardRow): string {
  if (!row.custom_redirect_uri) return ''
  try {
    return new URL(row.custom_redirect_uri).origin
  } catch {
    return ''
  }
}

function customRedirectFromBaseUrl(base: string): string {
  const trimmed = base.trim()
  if (!trimmed) return ''
  return `${trimmed.replace(/\/$/, '')}/auth/callback`
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

  const [selected, setSelected] = useState<DashboardRow | null>(null)
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  useEffect(() => {
    if (!selected) {
      setEditBaseUrl('')
      return
    }
    setEditBaseUrl(baseUrlFromRow(selected))
  }, [selected])

  function openEditor(row: DashboardRow) {
    setSelected(row)
    setEditBaseUrl(baseUrlFromRow(row))
  }

  function closeEditor() {
    if (saving || deleting) return
    setSelected(null)
  }

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

  async function saveDashboard() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/oauth/self-hosted-client${orgQuery}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selected.client_id,
          custom_redirect_uri: customRedirectFromBaseUrl(editBaseUrl),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as DashboardRow & {
        error_description?: string
      }
      if (!res.ok) {
        setError(
          typeof body.error_description === 'string'
            ? body.error_description
            : 'Não foi possível guardar as alterações.',
        )
        return
      }
      setToast('Dashboard atualizado.')
      setSelected(null)
      await load()
    } catch {
      setError('Não foi possível contactar o Portal.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDashboard() {
    if (!selected) return
    if (
      !window.confirm(
        `Apagar o dashboard "${selected.name}"? O OAuth client deixa de funcionar.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(
        `/api/oauth/self-hosted-client/${encodeURIComponent(selected.id)}${orgQuery}`,
        { method: 'DELETE', headers },
      )
      if (!res.ok) {
        setError('Não foi possível apagar o dashboard.')
        return
      }
      setToast(`Dashboard "${selected.name}" apagado.`)
      setSelected(null)
      await load()
    } catch {
      setError('Não foi possível contactar o Portal.')
    } finally {
      setDeleting(false)
    }
  }

  const saveDisabled =
    saving ||
    !selected ||
    editBaseUrl.trim() === baseUrlFromRow(selected)

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
            localhost são sempre permitidas; defina um URL público depois na
            engrenagem de cada linha.
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
                <th className={styles.actionsCol} aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={styles.dataRow}>
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
                  <td className={styles.actionsCol}>
                    <button
                      type="button"
                      className={styles.gearBtn}
                      title="Editar dashboard"
                      aria-label={`Editar ${row.name}`}
                      onClick={() => openEditor(row)}
                    >
                      ⚙
                    </button>
                  </td>
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
                na engrenagem.
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

      {selected ? (
        <>
          <div
            className={styles.drawerBackdrop}
            role="presentation"
            onClick={closeEditor}
          />
          <aside
            className={styles.drawer}
            role="dialog"
            aria-labelledby="local-edit-title"
          >
            <button
              type="button"
              className={styles.drawerClose}
              aria-label="Fechar"
              onClick={closeEditor}
            >
              ×
            </button>
            <p className={styles.drawerEyebrow}>{'// Local Dashboard'}</p>
            <h3 id="local-edit-title" className={styles.drawerTitle}>
              {selected.name}
            </h3>
            <p className={styles.drawerLead}>
              Copie o OAuth client ID para o dashboard Work4You local e,
              opcionalmente, fixe um redirect URI público.
            </p>

            <section className={styles.drawerSection}>
              <h4 className={styles.drawerSectionTitle}>Quem pode aceder</h4>
              <p className={styles.drawerSectionText}>
                Só você. Conta pessoal — o início de sessão limita-se a si.
              </p>
            </section>

            <section className={styles.drawerSection}>
              <h4 className={styles.drawerSectionTitle}>OAuth client ID</h4>
              <div className={styles.drawerClientRow}>
                <code className={styles.mono}>{selected.client_id}</code>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => void copyClientId(selected.client_id)}
                >
                  Copiar
                </button>
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h4 className={styles.drawerSectionTitle}>
                URI de redirecionamento do painel de controle
              </h4>
              <p className={styles.drawerSectionText}>
                Deixe em branco se você executar o painel de controle apenas em
                localhost — essa exceção é sempre permitida. Defina um domínio
                base quando o painel de controle estiver acessível em um URL
                público; nós adicionamos /auth/callback para você.
              </p>
              <label className={styles.field}>
                <span>Base URL</span>
                <input
                  className={styles.input}
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  placeholder="https://hermes.mycompany.com"
                />
              </label>
              <div className={styles.drawerSaveRow}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={saveDisabled}
                  onClick={() => void saveDashboard()}
                >
                  {saving ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h4 className={styles.drawerSectionTitle}>Apagar</h4>
              <p className={styles.drawerSectionText}>
                Remove este registo e bloqueia novas autorizações OAuth para o
                respetivo client ID.
              </p>
              <button
                type="button"
                className={styles.dangerLink}
                disabled={deleting}
                onClick={() => void deleteDashboard()}
              >
                {deleting ? 'A apagar…' : 'Apagar dashboard'}
              </button>
            </section>
          </aside>
        </>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </OrgPage>
  )
}
