'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import styles from './CloudPage.module.css'

type CloudSize = {
  id: 'small' | 'medium' | 'large'
  label: string
  maxSessions: number
  memoryMb: number
  cpus: number
  diskGb: number
  priceRunningUsd: string
  priceStoppedUsd: string
  blurb: string
}

type AgentRow = {
  id: string
  name: string
  status: string
  dashboardUrl: string | null
  dashboardGatewayState: string
  size: string
  model: string | null
  slug: string
  maxSessions: number
  memoryMb: number
  cpus: number
  diskGb: number
  priceRunningUsd: string
  priceStoppedUsd: string
  errorMessage: string | null
  createdAt: string
}

const FALLBACK_SIZES: CloudSize[] = [
  {
    id: 'small',
    label: 'Small',
    maxSessions: 5,
    memoryMb: 1024,
    cpus: 2,
    diskGb: 10,
    priceRunningUsd: '1.20',
    priceStoppedUsd: '0.15',
    blurb: '5 sessões · 1 GB RAM · 2 vCPUs · 10 GB disco',
  },
  {
    id: 'medium',
    label: 'Medium',
    maxSessions: 10,
    memoryMb: 2048,
    cpus: 4,
    diskGb: 20,
    priceRunningUsd: '2.40',
    priceStoppedUsd: '0.30',
    blurb: '10 sessões · 2 GB RAM · 4 vCPUs · 20 GB disco',
  },
  {
    id: 'large',
    label: 'Large',
    maxSessions: 20,
    memoryMb: 4096,
    cpus: 8,
    diskGb: 40,
    priceRunningUsd: '4.80',
    priceStoppedUsd: '0.60',
    blurb: '20 sessões · 4 GB RAM · 8 vCPUs · 40 GB disco',
  },
]

const DEFAULT_MODELS = [
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4',
  'google/gemini-2.5-flash',
  'openai/gpt-4o',
]

function statusLabel(status: string): string {
  switch (status) {
    case 'provisioning':
      return 'A provisionar'
    case 'starting':
      return 'A iniciar'
    case 'online':
      return 'Online'
    case 'stopped':
      return 'Parado'
    case 'error':
      return 'Erro'
    case 'deleting':
      return 'A apagar'
    default:
      return status
  }
}

function statusTone(status: string): string {
  if (status === 'online') return styles.toneOnline
  if (status === 'starting' || status === 'provisioning') return styles.toneWarm
  if (status === 'error') return styles.toneError
  return styles.toneMuted
}

export function CloudPage() {
  const { orgId } = useParams()
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [sizes, setSizes] = useState<CloudSize[]>(FALLBACK_SIZES)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('O meu Agent')
  const [createSize, setCreateSize] = useState<CloudSize['id']>('small')
  const [createModel, setCreateModel] = useState(DEFAULT_MODELS[0]!)
  const [creating, setCreating] = useState(false)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const selectedSize = useMemo(
    () => sizes.find((s) => s.id === createSize) || sizes[0]!,
    [sizes, createSize],
  )

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const orgQuery = orgId ? `?org=${encodeURIComponent(orgId)}` : ''

  const load = useCallback(async () => {
    if (!authenticated) {
      setAgents([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/agents${orgQuery}`, { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(
          typeof body?.message === 'string'
            ? body.message
            : `Falha ao listar agents (${res.status})`,
        )
        setAgents([])
        return
      }
      const data = (await res.json()) as {
        agents?: AgentRow[]
        sizes?: CloudSize[]
      }
      setAgents(Array.isArray(data.agents) ? data.agents : [])
      if (Array.isArray(data.sizes) && data.sizes.length) {
        setSizes(data.sizes)
      }
    } catch {
      setError('Não foi possível contactar o Portal.')
      setAgents([])
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders, orgQuery])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  // Poll while any instance is mid-flight.
  useEffect(() => {
    const pending = agents.some((a) =>
      ['provisioning', 'starting', 'deleting'].includes(a.status),
    )
    if (!pending) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [agents, load])

  const createAgent = async () => {
    setCreating(true)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          size: createSize,
          model: createModel,
          org: orgId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data?.message ||
            data?.error ||
            `Criação falhou (${res.status})`,
        )
        return
      }
      setCreateOpen(false)
      await load()
    } catch {
      setError('Criação falhou — rede.')
    } finally {
      setCreating(false)
    }
  }

  const runAction = async (id: string, action: 'start' | 'stop' | 'delete') => {
    setBusyId(id)
    setError(null)
    try {
      const headers = await authHeaders()
      if (!headers) return
      if (action === 'delete') {
        if (!confirm('Apagar esta instância e a VM no Fly?')) return
        const res = await fetch(
          `/api/agents/${id}${orgQuery}`,
          { method: 'DELETE', headers },
        )
        if (!res.ok) {
          setError(`Apagar falhou (${res.status})`)
          return
        }
      } else {
        const res = await fetch(`/api/agents/${id}/${action}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ org: orgId }),
        })
        if (!res.ok) {
          setError(`${action} falhou (${res.status})`)
          return
        }
      }
      await load()
    } catch {
      setError('Ação falhou — rede.')
    } finally {
      setBusyId(null)
    }
  }

  const saveRename = async (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    setBusyId(id)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, org: orgId }),
      })
      if (!res.ok) {
        setError(`Renomear falhou (${res.status})`)
        return
      }
      setRenameId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <OrgPage
      eyebrow="Work4You Cloud"
      title="Work4You Cloud"
      lead="Agent hospedado pela Work4You. Crie uma VM, acompanhe o estado e abra o dashboard."
    >
      <section className={styles.toolbar}>
        <div>
          <h2 className={styles.sectionTitle}>Instâncias</h2>
          <p className={styles.sectionLead}>
            {loading
              ? 'A carregar…'
              : agents.length === 0
                ? 'Nenhuma instância nesta org.'
                : `${agents.length} instância${agents.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setCreateOpen(true)}
          disabled={!authenticated}
        >
          + Create
        </button>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <div className={styles.grid}>
        {agents.map((agent) => (
          <article key={agent.id} className={styles.card}>
            <header className={styles.cardHead}>
              {renameId === agent.id ? (
                <div className={styles.renameRow}>
                  <input
                    className={styles.input}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(agent.id)
                      if (e.key === 'Escape') setRenameId(null)
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => void saveRename(agent.id)}
                  >
                    Guardar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.nameBtn}
                  onClick={() => {
                    setRenameId(agent.id)
                    setRenameValue(agent.name)
                  }}
                  title="Renomear"
                >
                  {agent.name}
                </button>
              )}
              <span className={`${styles.badge} ${statusTone(agent.status)}`}>
                {statusLabel(agent.status)}
              </span>
            </header>

            <dl className={styles.meta}>
              <div>
                <dt>Tamanho</dt>
                <dd>{agent.size}</dd>
              </div>
              <div>
                <dt>Recursos</dt>
                <dd>
                  {agent.maxSessions} sess · {agent.memoryMb} MB · {agent.cpus}{' '}
                  vCPU · {agent.diskGb} GB
                </dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>{agent.model || '—'}</dd>
              </div>
              <div>
                <dt>Gateway</dt>
                <dd>{agent.dashboardGatewayState}</dd>
              </div>
            </dl>

            {agent.errorMessage ? (
              <p className={styles.cardError}>{agent.errorMessage}</p>
            ) : null}

            <div className={styles.cardActions}>
              {agent.dashboardUrl ? (
                <a
                  className={styles.primary}
                  href={
                    agent.dashboardUrl.replace(/\/$/, '') + '/sessions'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Dashboard
                </a>
              ) : (
                <button type="button" className={styles.primary} disabled>
                  Open Dashboard
                </button>
              )}
              {agent.status === 'stopped' ? (
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={busyId === agent.id}
                  onClick={() => void runAction(agent.id, 'start')}
                >
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={
                    busyId === agent.id ||
                    ['provisioning', 'starting', 'deleting'].includes(
                      agent.status,
                    )
                  }
                  onClick={() => void runAction(agent.id, 'stop')}
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                className={styles.danger}
                disabled={busyId === agent.id}
                onClick={() => void runAction(agent.id, 'delete')}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {createOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-labelledby="cloud-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="cloud-create-title" className={styles.modalTitle}>
              Criar Agent
            </h3>
            <p className={styles.modalLead}>
              Escolha o nome, o modelo e o tamanho da VM. A instância fica
              disponível no Desktop via descoberta Cloud.
            </p>

            <label className={styles.field}>
              <span>Nome</span>
              <input
                className={styles.input}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={64}
              />
            </label>

            <label className={styles.field}>
              <span>Modelo</span>
              <select
                className={styles.input}
                value={createModel}
                onChange={(e) => setCreateModel(e.target.value)}
              >
                {DEFAULT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.sizeGrid}>
              {sizes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.sizeCard} ${
                    createSize === s.id ? styles.sizeCardActive : ''
                  }`}
                  onClick={() => setCreateSize(s.id)}
                >
                  <strong>{s.label}</strong>
                  <span>{s.blurb}</span>
                  <span className={styles.priceLine}>
                    A correr ${s.priceRunningUsd}/dia · Parado $
                    {s.priceStoppedUsd}/dia
                  </span>
                </button>
              ))}
            </div>

            <p className={styles.modalHint}>
              Selecionado: {selectedSize.label} — até {selectedSize.maxSessions}{' '}
              sessões.
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.ghost}
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={creating || !createName.trim()}
                onClick={() => void createAgent()}
              >
                {creating ? 'A criar…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </OrgPage>
  )
}
