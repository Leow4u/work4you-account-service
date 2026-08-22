import { FormEvent, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSearchParams } from 'next/navigation'
import { PrivyAppProvider } from '../providers/PrivyAppProvider'
import styles from './OAuthAuthorizePage.module.css'

type ApproveResponse =
  | {
      ok: true
      redirect: string
      agent?: { id: string; name: string; dashboardUrl: string | null }
    }
  | { error: string; error_description?: string }

function AuthorizeInner() {
  const params = useSearchParams()
  const { ready, authenticated, login } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const oauth = useMemo(
    () => ({
      response_type: params.get('response_type') || '',
      client_id: params.get('client_id') || '',
      redirect_uri: params.get('redirect_uri') || '',
      scope: params.get('scope') || '',
      state: params.get('state') || '',
      code_challenge: params.get('code_challenge') || '',
      code_challenge_method: params.get('code_challenge_method') || 'S256',
    }),
    [params],
  )

  const returnPath = useMemo(() => {
    const q = params.toString()
    return q ? `/oauth/authorize?${q}` : '/oauth/authorize'
  }, [params])

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      const next = encodeURIComponent(returnPath)
      window.location.replace(`/login?next=${next}`)
    }
  }, [ready, authenticated, returnPath])

  const invalid =
    oauth.response_type !== 'code' ||
    !oauth.client_id.startsWith('agent:') ||
    !oauth.redirect_uri ||
    !oauth.state ||
    !oauth.code_challenge

  async function onApprove(e: FormEvent) {
    e.preventDefault()
    if (invalid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/oauth/authorize/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(oauth),
      })
      const data = (await res.json()) as ApproveResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        const msg =
          'error_description' in data && data.error_description
            ? data.error_description
            : 'error' in data
              ? data.error
              : 'authorization_failed'
        setError(msg)
        return
      }
      window.location.replace(data.redirect)
    } catch {
      setError('Não foi possível contactar o Portal.')
    } finally {
      setBusy(false)
    }
  }

  function onDeny() {
    if (!oauth.redirect_uri) return
    const sep = oauth.redirect_uri.includes('?') ? '&' : '?'
    const url = `${oauth.redirect_uri}${sep}error=access_denied&state=${encodeURIComponent(oauth.state)}`
    window.location.replace(url)
  }

  if (!ready || !authenticated) {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>A verificar sessão…</p>
      </div>
    )
  }

  const agentLabel = oauth.client_id.replace(/^agent:/, '')

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>Ligar ao agente</h1>
        <p className={styles.lead}>
          O dashboard do agente pede acesso à sua conta Work4You para iniciar
          sessão com OAuth.
        </p>

        {invalid ? (
          <p className={styles.error} role="alert">
            Pedido OAuth inválido ou incompleto.
          </p>
        ) : null}

        <dl className={styles.meta}>
          <div>
            <dt>Instância</dt>
            <dd>{agentLabel}</dd>
          </div>
          <div>
            <dt>Permissão</dt>
            <dd>Acesso ao dashboard do agente</dd>
          </div>
        </dl>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <form className={styles.actions} onSubmit={(e) => void onApprove(e)}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onDeny}
            disabled={busy || invalid}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={busy || invalid}
          >
            {busy ? 'A autorizar…' : 'Autorizar'}
          </button>
        </form>

        <p className={styles.muted}>
          Não reconhece este pedido?{' '}
          <button type="button" className={styles.link} onClick={() => login()}>
            Inicie sessão com outra conta
          </button>
          .
        </p>
      </div>
    </div>
  )
}

export function OAuthAuthorizePage() {
  return (
    <PrivyAppProvider>
      <AuthorizeInner />
    </PrivyAppProvider>
  )
}
