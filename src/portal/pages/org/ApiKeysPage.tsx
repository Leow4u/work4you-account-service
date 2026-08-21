'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { OrgPage } from '../../components/OrgPage'
import styles from './ApiKeysPage.module.css'

const INFERENCE_BASE =
  process.env.NEXT_PUBLIC_INFERENCE_API_URL ||
  'https://inference-api.work4you.ai'

export interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  createdLabel: string
  lastUsedLabel: string
  totalSpentLabel: string
}

type PlayMode = 'chat' | 'completion'
type CodeLang = 'curl' | 'node' | 'browser' | 'python' | 'go' | 'kotlin'

const CODE_LANGS: { id: CodeLang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'node', label: 'Node' },
  { id: 'browser', label: 'Browser JS' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'kotlin', label: 'Kotlin' },
]

/** Prefer stable catalog IDs — OpenRouter often lists experimental first. */
const PREFERRED_MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'anthropic/claude-sonnet-4',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-v4-flash',
] as const

function isNoisyModelId(id: string): boolean {
  const lower = id.toLowerCase()
  return (
    lower.includes('-exp') ||
    lower.includes('-vision-exp') ||
    lower.startsWith('~') ||
    lower.endsWith(':free')
  )
}

function sortModelIds(ids: string[]): string[] {
  const set = new Set(ids)
  const preferred = PREFERRED_MODELS.filter((id) => set.has(id))
  const rest = ids
    .filter((id) => !(PREFERRED_MODELS as readonly string[]).includes(id))
    .sort((a, b) => a.localeCompare(b))
  return [...preferred, ...rest]
}

function pickDefaultModel(ids: string[]): string {
  for (const pref of PREFERRED_MODELS) {
    if (ids.includes(pref)) return pref
  }
  const stable = ids.find((id) => !isNoisyModelId(id))
  return stable || ids[0] || 'openai/gpt-4o-mini'
}

export function ApiKeysPage() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('Chave de API')
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Playground
  const [playMode, setPlayMode] = useState<PlayMode>('chat')
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState<string>('openai/gpt-4o-mini')
  const [selectedKeyId, setSelectedKeyId] = useState<string>('')
  const [playgroundSecret, setPlaygroundSecret] = useState('')
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userPrompt, setUserPrompt] = useState('')
  const [completionPrompt, setCompletionPrompt] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [codeLang, setCodeLang] = useState<CodeLang>('curl')
  const [responseText, setResponseText] = useState('')
  const [generating, setGenerating] = useState(false)

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const load = useCallback(async () => {
    if (!authenticated) {
      setKeys([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/keys', { headers })
      if (!res.ok) {
        setKeys([])
        return
      }
      const data = (await res.json()) as { keys?: ApiKeyRow[] }
      const list = Array.isArray(data.keys) ? data.keys : []
      setKeys(list)
      setSelectedKeyId((prev) => prev || (list[0]?.id ?? ''))
    } catch {
      setKeys([])
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  async function createKey() {
    setBusy('create')
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { key: ApiKeyRow; secret: string }
      setRevealedSecret(data.secret)
      setPlaygroundSecret(data.secret)
      setSelectedKeyId(data.key.id)
      setCreateOpen(false)
      setCreateName('Chave de API')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function saveRename(id: string) {
    setBusy(`rename:${id}`)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/keys/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      })
      if (res.ok) {
        setEditingId(null)
        await load()
      }
    } finally {
      setBusy(null)
    }
  }

  async function revoke(id: string) {
    setBusy(`revoke:${id}`)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/keys/${id}`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok) {
        if (selectedKeyId === id) setSelectedKeyId('')
        if (revealedSecret) setRevealedSecret(null)
        await load()
      }
    } finally {
      setBusy(null)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const effectiveSecret = useMemo(() => {
    if (playgroundSecret.trim()) return playgroundSecret.trim()
    if (revealedSecret && selectedKeyId) {
      const match = keys.find((k) => k.id === selectedKeyId)
      if (match) return revealedSecret
    }
    return ''
  }, [playgroundSecret, revealedSecret, selectedKeyId, keys])

  useEffect(() => {
    if (!effectiveSecret) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${INFERENCE_BASE}/v1/models`, {
          headers: { Authorization: `Bearer ${effectiveSecret}` },
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          data?: Array<{ id?: string }>
        }
        const ids = (data.data || [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
        if (!cancelled && ids.length) {
          const sorted = sortModelIds(ids)
          setModels(sorted)
          setModel((prev) =>
            prev && sorted.includes(prev) ? prev : pickDefaultModel(sorted),
          )
        }
      } catch {
        /* catalog optional until key works */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveSecret])

  const codeSnippet = useMemo(() => {
    const key = effectiveSecret || 'sk-work4you-…'
    const base = INFERENCE_BASE
    const mt = Math.min(4096, Math.max(1, maxTokens))
    if (playMode === 'chat') {
      const body = {
        model: model || 'openai/gpt-4o-mini',
        max_tokens: mt,
        messages: [
          ...(systemPrompt.trim()
            ? [{ role: 'system', content: systemPrompt }]
            : []),
          { role: 'user', content: userPrompt || 'Olá' },
        ],
      }
      const json = JSON.stringify(body, null, 2)
      switch (codeLang) {
        case 'curl':
          return `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body)}'`
        case 'node':
          return `const res = await fetch("${base}/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${key}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json}),\n});\nconsole.log(await res.json());`
        case 'browser':
          return `const res = await fetch("${base}/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${key}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json}),\n});\nconsole.log(await res.json());`
        case 'python':
          return `import requests\n\nr = requests.post(\n    "${base}/v1/chat/completions",\n    headers={"Authorization": f"Bearer ${key}"},\n    json=${json},\n)\nprint(r.json())`
        case 'go':
          return `// POST ${base}/v1/chat/completions\n// Authorization: Bearer ${key}\n// Content-Type: application/json\n// Body: ${JSON.stringify(body)}`
        case 'kotlin':
          return `// POST ${base}/v1/chat/completions\n// Authorization: Bearer ${key}\n// body = ${JSON.stringify(body)}`
      }
    }
    const body = {
      model: model || 'openai/gpt-4o-mini',
      max_tokens: mt,
      prompt: completionPrompt || 'Olá',
    }
    const json = JSON.stringify(body, null, 2)
    switch (codeLang) {
      case 'curl':
        return `curl ${base}/v1/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body)}'`
      case 'node':
      case 'browser':
        return `const res = await fetch("${base}/v1/completions", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${key}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json}),\n});\nconsole.log(await res.json());`
      case 'python':
        return `import requests\n\nr = requests.post(\n    "${base}/v1/completions",\n    headers={"Authorization": f"Bearer ${key}"},\n    json=${json},\n)\nprint(r.json())`
      case 'go':
        return `// POST ${base}/v1/completions\n// Authorization: Bearer ${key}\n// Body: ${JSON.stringify(body)}`
      case 'kotlin':
        return `// POST ${base}/v1/completions\n// Authorization: Bearer ${key}\n// body = ${JSON.stringify(body)}`
    }
  }, [
    codeLang,
    completionPrompt,
    effectiveSecret,
    maxTokens,
    model,
    playMode,
    systemPrompt,
    userPrompt,
  ])

  async function generate() {
    if (!effectiveSecret) {
      setResponseText('Seleccione ou cole uma chave sk-work4you-…')
      return
    }
    setGenerating(true)
    setResponseText('')
    try {
      const mt = Math.min(4096, Math.max(1, Number(maxTokens) || 1024))
      const path =
        playMode === 'chat' ? '/v1/chat/completions' : '/v1/completions'
      const body =
        playMode === 'chat'
          ? {
              model: model || 'openai/gpt-4o-mini',
              max_tokens: mt,
              messages: [
                ...(systemPrompt.trim()
                  ? [{ role: 'system', content: systemPrompt }]
                  : []),
                { role: 'user', content: userPrompt || 'Olá' },
              ],
            }
          : {
              model: model || 'openai/gpt-4o-mini',
              max_tokens: mt,
              prompt: completionPrompt || 'Olá',
            }
      const res = await fetch(`${INFERENCE_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${effectiveSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      try {
        const parsed = JSON.parse(text) as {
          error?: { message?: string; code?: number | string }
        }
        const msg = parsed?.error?.message || ''
        if (
          typeof msg === 'string' &&
          msg.includes('guardrail restrictions and data policy')
        ) {
          setResponseText(
            JSON.stringify(
              {
                error: {
                  message:
                    'Este modelo não está disponível com a política actual do gateway. Escolhe outro (ex.: openai/gpt-4o-mini).',
                  code: parsed.error?.code ?? 404,
                  upstream: msg,
                },
              },
              null,
              2,
            ),
          )
        } else {
          setResponseText(JSON.stringify(parsed, null, 2))
        }
      } catch {
        setResponseText(text)
      }
    } catch (err) {
      setResponseText(err instanceof Error ? err.message : 'erro')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <OrgPage eyebrow="API keys" title="Chaves de API">
        <section className={styles.section} aria-labelledby="keys-heading">
          <div className={styles.sectionHead}>
            <h2 id="keys-heading" className={styles.sectionTitle}>
              Chaves
            </h2>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                setCreateOpen(true)
                setRevealedSecret(null)
              }}
            >
              + Criar chave
            </button>
          </div>

          {createOpen ? (
            <div className={styles.createBox}>
              <label className={styles.label}>
                Nome
                <input
                  className={styles.input}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                />
              </label>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy === 'create'}
                  onClick={() => void createKey()}
                >
                  Criar chave
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {revealedSecret ? (
            <div className={styles.secretBox}>
              <code className={styles.secret}>{revealedSecret}</code>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => void copyText(revealedSecret)}
              >
                Copiar
              </button>
            </div>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Chave</th>
                  <th scope="col">Criado</th>
                  <th scope="col">Última utilização</th>
                  <th scope="col">Gasto total</th>
                  <th scope="col"> </th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  keys.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {editingId === row.id ? (
                          <span className={styles.editRow}>
                            <input
                              className={styles.inputSm}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              maxLength={80}
                            />
                            <button
                              type="button"
                              className={styles.ghost}
                              disabled={busy === `rename:${row.id}`}
                              onClick={() => void saveRename(row.id)}
                            >
                              Guardar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.nameBtn}
                            onClick={() => {
                              setEditingId(row.id)
                              setEditName(row.name)
                            }}
                          >
                            {row.name}
                          </button>
                        )}
                      </td>
                      <td className={styles.keyCell}>
                        <span>{row.keyPrefix}</span>
                        {revealedSecret && selectedKeyId === row.id ? (
                          <button
                            type="button"
                            className={styles.linkish}
                            onClick={() => void copyText(revealedSecret)}
                          >
                            Copiar
                          </button>
                        ) : null}
                      </td>
                      <td className={styles.muted}>{row.createdLabel}</td>
                      <td className={styles.muted}>{row.lastUsedLabel}</td>
                      <td className={styles.muted}>{row.totalSpentLabel}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy === `revoke:${row.id}`}
                          onClick={() => void revoke(row.id)}
                        >
                          Revogar
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="play-heading">
          <h2 id="play-heading" className={styles.sectionTitle}>
            Exemplo
          </h2>

          <div className={styles.tabs}>
            <button
              type="button"
              className={playMode === 'chat' ? styles.tabOn : styles.tab}
              onClick={() => setPlayMode('chat')}
            >
              Chat Completion
            </button>
            <button
              type="button"
              className={playMode === 'completion' ? styles.tabOn : styles.tab}
              onClick={() => setPlayMode('completion')}
            >
              Completion
            </button>
          </div>

          <div className={styles.playGrid}>
            <label className={styles.label}>
              Modelo
              {models.length ? (
                <select
                  className={styles.input}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="openai/gpt-4o-mini"
                />
              )}
            </label>

            <label className={styles.label}>
              Chave
              <input
                className={styles.input}
                value={playgroundSecret}
                onChange={(e) => setPlaygroundSecret(e.target.value)}
                placeholder="sk-work4you-…"
                autoComplete="off"
              />
            </label>

            <label className={styles.label}>
              Max tokens
              <input
                className={styles.input}
                type="number"
                min={1}
                max={4096}
                value={maxTokens}
                onChange={(e) =>
                  setMaxTokens(
                    Math.min(4096, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
          </div>

          {playMode === 'chat' ? (
            <div className={styles.promptStack}>
              <label className={styles.label}>
                System
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                User
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className={styles.label}>
              Prompt
              <textarea
                className={styles.textarea}
                rows={4}
                value={completionPrompt}
                onChange={(e) => setCompletionPrompt(e.target.value)}
              />
            </label>
          )}

          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setShowCode((v) => !v)}
            >
              {showCode ? 'Ocultar código' : 'Exibir código…'}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={generating}
              onClick={() => void generate()}
            >
              Gerar
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => void copyText(responseText)}
              disabled={!responseText}
            >
              Copiar
            </button>
          </div>

          {showCode ? (
            <div className={styles.codeBox}>
              <div className={styles.codeTabs}>
                {CODE_LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={
                      codeLang === l.id ? styles.tabOn : styles.tab
                    }
                    onClick={() => setCodeLang(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <pre className={styles.pre}>{codeSnippet}</pre>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => void copyText(codeSnippet)}
              >
                Copiar código
              </button>
            </div>
          ) : null}

          <label className={styles.label}>
            Resposta
            <pre className={styles.response}>{responseText || '—'}</pre>
          </label>
        </section>
      </OrgPage>
    </div>
  )
}
