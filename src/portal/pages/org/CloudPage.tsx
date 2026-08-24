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
    label: 'Pequeno',
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
    label: 'Médio',
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
    label: 'Grande',
    maxSessions: 20,
    memoryMb: 4096,
    cpus: 8,
    diskGb: 40,
    priceRunningUsd: '4.80',
    priceStoppedUsd: '0.60',
    blurb: '20 sessões · 4 GB RAM · 8 vCPUs · 40 GB disco',
  },
]

type AnnotatedModelOption = {
  id: string
  name: string
  free: boolean
  locked: boolean
}

const FALLBACK_MODELS: AnnotatedModelOption[] = [
  { id: 'openrouter/free', name: 'openrouter/free', free: true, locked: false },
]

const SIZE_LABELS: Record<string, string> = {
  small: 'Pequeno',
  medium: 'Médio',
  large: 'Grande',
}

function sizeLabel(size: string): string {
  return SIZE_LABELS[size.toLowerCase()] || size
}

function formatMemory(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`
  return `${mb} MB`
}

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

function gatewayHint(state: string, status: string): string | null {
  if (status !== 'online') return null
  switch (state) {
    case 'active':
      return null
    case 'degraded':
      return 'Gateway com lentidão'
    case 'down':
      return 'Gateway indisponível'
    default:
      return 'A verificar gateway'
  }
}

function statusTone(status: string): string {
  if (status === 'online') return styles.toneOnline
  if (status === 'starting' || status === 'provisioning') return styles.toneWarm
  if (status === 'error') return styles.toneError
  return styles.toneMuted
}

function actionErrorLabel(action: 'start' | 'stop' | 'delete'): string {
  if (action === 'start') return 'Não foi possível iniciar a instância.'
  if (action === 'stop') return 'Não foi possível parar a instância.'
  return 'Não foi possível apagar a instância.'
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
  const [createName, setCreateName] = useState('O meu agent')
  const [createSize, setCreateSize] = useState<CloudSize['id']>('small')
  const [createModel, setCreateModel] = useState(FALLBACK_MODELS[0]!.id)
  const [createModels, setCreateModels] = useState<AnnotatedModelOption[]>(FALLBACK_MODELS)
  const [createModelsLoading, setCreateModelsLoading] = useState(false)
  const [paidPlan, setPaidPlan] = useState<boolean | null>(null)
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!authenticated) {
      setAgents([])
      setLoading(false)
      return
    }
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/agents${orgQuery}`, { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (!opts?.silent) {
          setError(
            typeof body?.message === 'string'
              ? body.message
              : 'Não foi possível carregar as instâncias.',
          )
          setAgents([])
        }
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
      if (!opts?.silent) {
        setError('Não foi possível contactar o Portal.')
        setAgents([])
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [authenticated, authHeaders, orgQuery])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  useEffect(() => {
    const pending = agents.some((a) =>
      ['provisioning', 'starting', 'deleting'].includes(a.status),
    )
    if (!pending) return
    const t = setInterval(() => void load({ silent: true }), 4000)
    return () => clearInterval(t)
  }, [agents, load])

  useEffect(() => {
    if (!createOpen || !authenticated) return
    let cancelled = false
    void (async () => {
      setCreateModelsLoading(true)
      try {
        const headers = await authHeaders()
        if (!headers || cancelled) return
        const res = await fetch(`/api/keys/models${orgQuery}`, { headers })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          defaultModel?: string
          paidPlan?: boolean
          models?: AnnotatedModelOption[]
        }
        const models = Array.isArray(data.models) ? data.models : FALLBACK_MODELS
        if (cancelled) return
        setCreateModels(models)
        setPaidPlan(typeof data.paidPlan === 'boolean' ? data.paidPlan : null)
        const defaultId =
          typeof data.defaultModel === 'string' && data.defaultModel
            ? data.defaultModel
            : models.find((m) => !m.locked)?.id || FALLBACK_MODELS[0]!.id
        setCreateModel(defaultId)
      } catch {
        if (!cancelled) {
          setCreateModels(FALLBACK_MODELS)
          setCreateModel(FALLBACK_MODELS[0]!.id)
        }
      } finally {
        if (!cancelled) setCreateModelsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [createOpen, authenticated, authHeaders, orgQuery])

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
            (data?.error === 'fly_not_configured'
              ? 'Configuração Fly em falta no Portal.'
              : 'Não foi possível criar a instância.'),
        )
        return
      }
      setCreateOpen(false)
      await load()
    } catch {
      setError('Não foi possível criar a instância — rede.')
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
        const res = await fetch(`/api/agents/${id}${orgQuery}`, {
          method: 'DELETE',
          headers,
        })
        if (!res.ok) {
          setError(actionErrorLabel(action))
          return
        }
      } else {
        const res = await fetch(`/api/agents/${id}/${action}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ org: orgId }),
        })
        if (!res.ok) {
          setError(actionErrorLabel(action))
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
        setError('Não foi possível renomear.')
        return
      }
      setRenameId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const instanceCountLabel = loading
    ? 'A carregar…'
    : agents.length === 0
      ? 'Nenhuma instância nesta organização.'
      : `${agents.length} instância${agents.length === 1 ? '' : 's'}`

  return (
    <OrgPage
      eyebrow="Work4You Cloud"
      title="Instâncias"
      lead="Agent hospedado pela Work4You. Crie uma VM, acompanhe o estado e abra o dashboard."
    >
      <section className={styles.toolbar}>
        <p className={styles.sectionLead}>{instanceCountLabel}</p>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setCreateOpen(true)}
          disabled={!authenticated || loading}
        >
          Criar instância
        </button>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      {!loading && agents.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>Ainda sem instâncias</p>
          <p className={styles.emptyText}>
            Crie a primeira VM Cloud. O Desktop descobre automaticamente via
            Work4You Cloud depois de criada.
          </p>
        </section>
      ) : null}

      <div className={styles.grid}>
        {agents.map((agent) => {
          const hint = gatewayHint(agent.dashboardGatewayState, agent.status)
          return (
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

              <p className={styles.cardMeta}>
                <span className={styles.sizeChip}>{sizeLabel(agent.size)}</span>
                {agent.maxSessions} sessões · {formatMemory(agent.memoryMb)} ·{' '}
                {agent.cpus} vCPU · {agent.diskGb} GB disco
              </p>
              {agent.model ? (
                <p className={styles.cardModel}>{agent.model}</p>
              ) : null}
              {hint ? <p className={styles.cardWarn}>{hint}</p> : null}
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
                    Abrir dashboard
                  </a>
                ) : (
                  <button type="button" className={styles.primary} disabled>
                    Abrir dashboard
                  </button>
                )}
                {agent.status === 'stopped' ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busyId === agent.id}
                    onClick={() => void runAction(agent.id, 'start')}
                  >
                    Iniciar
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
                    Parar
                  </button>
                )}
                <button
                  type="button"
                  className={styles.danger}
                  disabled={busyId === agent.id}
                  onClick={() => void runAction(agent.id, 'delete')}
                >
                  Apagar
                </button>
              </div>
            </article>
          )
        })}
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
              Criar instância
            </h3>
            <p className={styles.modalLead}>
              Escolha o nome, o modelo e o tamanho da VM.
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
              {paidPlan === false ? (
                <p className={styles.modalLead}>
                  Plano Free — modelos pagos aparecem bloqueados.
                </p>
              ) : null}
              <select
                className={styles.input}
                value={createModel}
                disabled={createModelsLoading}
                onChange={(e) => setCreateModel(e.target.value)}
              >
                {createModels.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.locked}>
                    {m.name}
                    {m.locked ? ' (plano pago)' : m.free ? ' (free)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className={styles.sizeFieldset}>
              <legend className={styles.sizeLegend}>Tamanho</legend>
              <div className={styles.sizeGrid}>
                {sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.sizeCard} ${
                      createSize === s.id ? styles.sizeCardActive : ''
                    }`}
                    onClick={() => setCreateSize(s.id)}
                    aria-pressed={createSize === s.id}
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
            </fieldset>

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
                {creating ? 'A criar…' : `Criar ${selectedSize.label.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </OrgPage>
  )
}
