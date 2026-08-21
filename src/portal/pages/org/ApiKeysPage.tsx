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
  copyable: boolean
  createdLabel: string
  lastUsedLabel: string
  totalSpentLabel: string
}

type CatalogModel = {
  id: string
  name: string
  free: boolean
  locked: boolean
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

  const [playMode, setPlayMode] = useState<PlayMode>('chat')
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [model, setModel] = useState('openai/gpt-4o-mini')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.')
  const [userPrompt, setUserPrompt] = useState('')
  const [completionPrompt, setCompletionPrompt] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [codeLang, setCodeLang] = useState<CodeLang>('curl')
  const [responseText, setResponseText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [snippetSecret, setSnippetSecret] = useState('sk-work4you-…')

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }, [getAccessToken])

  const loadKeys = useCallback(async () => {
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
      setSelectedKeyId((prev) => {
        if (prev && list.some((k) => k.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    } catch {
      setKeys([])
    } finally {
      setLoading(false)
    }
  }, [authenticated, authHeaders])

  const loadModels = useCallback(async () => {
    if (!authenticated) {
      setCatalog([])
      return
    }
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/keys/models', { headers })
      if (!res.ok) return
      const data = (await res.json()) as {
        defaultModel?: string
        models?: CatalogModel[]
      }
      const models = Array.isArray(data.models) ? data.models : []
      setCatalog(models)
      setModel((prev) => {
        const stillOk = models.some((m) => m.id === prev && !m.locked)
        if (stillOk) return prev
        return data.defaultModel || models.find((m) => !m.locked)?.id || prev
      })
    } catch {
      /* catalog optional */
    }
  }, [authenticated, authHeaders])

  useEffect(() => {
    if (!ready) return
    void loadKeys()
    void loadModels()
  }, [ready, loadKeys, loadModels])

  useEffect(() => {
    if (!selectedKeyId || !authenticated) return
    const row = keys.find((k) => k.id === selectedKeyId)
    if (!row?.copyable) {
      setSnippetSecret('sk-work4you-…')
      return
    }
    let cancelled = false
    void (async () => {
      const headers = await authHeaders()
      if (!headers || cancelled) return
      const res = await fetch(`/api/keys/${selectedKeyId}/secret`, { headers })
      if (!res.ok || cancelled) return
      const data = (await res.json()) as { secret?: string }
      if (data.secret && !cancelled) setSnippetSecret(data.secret)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedKeyId, keys, authenticated, authHeaders])

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
      setSnippetSecret(data.secret)
      setSelectedKeyId(data.key.id)
      setCreateOpen(false)
      setCreateName('Chave de API')
      await loadKeys()
    } finally {
      setBusy(null)
    }
  }

  async function copyKeySecret(id: string) {
    setBusy(`copy:${id}`)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/keys/${id}/secret`, { headers })
      if (!res.ok) {
        setResponseText(
          'Esta chave não pode ser copiada (criada antes do suporte a revelação). Revoga e cria outra.',
        )
        return
      }
      const data = (await res.json()) as { secret?: string }
      if (!data.secret) return
      setSnippetSecret(data.secret)
      if (selectedKeyId === id) setRevealedSecret(data.secret)
      await navigator.clipboard.writeText(data.secret)
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
        await loadKeys()
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
        if (selectedKeyId === id) {
          setSelectedKeyId('')
          setRevealedSecret(null)
          setSnippetSecret('sk-work4you-…')
        }
        await loadKeys()
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

  const unlockedModels = useMemo(
    () => catalog.filter((m) => !m.locked),
    [catalog],
  )
  const lockedModels = useMemo(
    () => catalog.filter((m) => m.locked),
    [catalog],
  )

  const codeSnippet = useMemo(() => {
    const key = snippetSecret
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
        case 'browser':
          return `const res = await fetch("${base}/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${key}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json}),\n});\nconsole.log(await res.json());`
        case 'python':
          return `import requests\n\nr = requests.post(\n    "${base}/v1/chat/completions",\n    headers={"Authorization": f"Bearer ${key}"},\n    json=${json},\n)\nprint(r.json())`
        case 'go':
          return `// POST ${base}/v1/chat/completions\n// Authorization: Bearer ${key}\n// Body: ${JSON.stringify(body)}`
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
    maxTokens,
    model,
    playMode,
    snippetSecret,
    systemPrompt,
    userPrompt,
  ])

  async function generate() {
    if (!selectedKeyId) {
      setResponseText('Selecione uma chave')
      return
    }
    const chosen = catalog.find((m) => m.id === model)
    if (chosen?.locked) {
      setResponseText(
        JSON.stringify(
          {
            error: {
              message: 'Modelo disponível apenas em planos pagos.',
              code: 'paid_plan_required',
            },
          },
          null,
          2,
        ),
      )
      return
    }
    setGenerating(true)
    setResponseText('')
    try {
      const headers = await authHeaders()
      if (!headers) return
      const mt = Math.min(4096, Math.max(1, Number(maxTokens) || 1024))
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
      const res = await fetch('/api/keys/playground', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: selectedKeyId,
          mode: playMode,
          body,
        }),
      })
      const text = await res.text()
      try {
        setResponseText(JSON.stringify(JSON.parse(text), null, 2))
      } catch {
        setResponseText(text)
      }
      await loadKeys()
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
                        <button
                          type="button"
                          className={styles.linkish}
                          disabled={
                            !row.copyable || busy === `copy:${row.id}`
                          }
                          title={
                            row.copyable
                              ? 'Copiar chave'
                              : 'Recria a chave para poder copiar'
                          }
                          onClick={() => void copyKeySecret(row.id)}
                        >
                          Copiar
                        </button>
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
              className={
                playMode === 'completion' ? styles.tabOn : styles.tab
              }
              onClick={() => setPlayMode('completion')}
            >
              Completion
            </button>
          </div>

          <div className={styles.playGrid}>
            <label className={styles.label}>
              Modelo
              <select
                className={styles.input}
                value={model}
                onChange={(e) => {
                  const id = e.target.value
                  const hit = catalog.find((m) => m.id === id)
                  if (hit?.locked) return
                  setModel(id)
                }}
              >
                {unlockedModels.length ? (
                  <optgroup label="Disponíveis">
                    {unlockedModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option value={model}>{model}</option>
                )}
                {lockedModels.length ? (
                  <optgroup label="Plano pago">
                    {lockedModels.map((m) => (
                      <option key={m.id} value={m.id} disabled>
                        {`🔒 ${m.id}`}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className={styles.label}>
              Chave
              <select
                className={styles.input}
                value={selectedKeyId}
                onChange={(e) => {
                  setSelectedKeyId(e.target.value)
                  setRevealedSecret(null)
                  setSnippetSecret('sk-work4you-…')
                }}
              >
                {!keys.length ? (
                  <option value="">Sem chaves</option>
                ) : (
                  keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))
                )}
              </select>
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

          {/* locks in the model select are enough — no plan legend */}

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
              disabled={generating || !selectedKeyId}
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
                    className={codeLang === l.id ? styles.tabOn : styles.tab}
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
