'use client'

import { usePrivy } from '@privy-io/react-auth'
import { FormEvent, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import styles from './LoginPage.module.css'

export function DeviceApprovePage() {
  const [params] = useSearchParams()
  const initial = (params.get('user_code') || '').toUpperCase()
  const [userCode, setUserCode] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ready, authenticated, getAccessToken } = usePrivy()

  const canSubmit = useMemo(
    () => userCode.replace(/[^A-Z0-9]/gi, '').length >= 8,
    [userCode],
  )

  if (ready && !authenticated) {
    const next = `/device?user_code=${encodeURIComponent(userCode || initial)}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Sem token')
        return
      }
      const res = await fetch('/api/oauth/device/approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_code: userCode.trim().toUpperCase() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || `erro ${res.status}`)
        return
      }
      setDone(true)
    } catch {
      setError('falha de rede')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return <div className={styles.page} />
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Autorizar dispositivo</h1>
        {done ? (
          <p className={styles.title} style={{ fontSize: '1.1rem' }}>
            Autorizado
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)}>
            <input
              className={styles.input}
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              autoComplete="one-time-code"
              spellCheck={false}
              aria-label="Código"
            />
            {error ? <p className={styles.notice}>{error}</p> : null}
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || !canSubmit}
            >
              {busy ? '…' : 'Autorizar'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
