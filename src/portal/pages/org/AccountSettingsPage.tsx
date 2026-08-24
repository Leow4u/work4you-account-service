'use client'

import type { LinkedAccountWithMetadata } from '@privy-io/react-auth'
import {
  useLinkAccount,
  usePrivy,
  useUnlinkEmail,
  useUnlinkOAuth,
  useUnlinkPasskey,
} from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'
import { displayName } from '../../lib/auth-display'
import {
  canUnlinkLinkedAccount,
  isProviderLinked,
  LINKABLE_PROVIDERS,
  linkedAccountKind,
  linkedAccountLabel,
  portalLinkedAccounts,
  type LinkableProvider,
} from '../../lib/linked-accounts'
import styles from './AccountSettingsPage.module.css'

function privyErrorMessage(error: unknown): string {
  const message = String(error ?? '')
  if (!message || message === 'undefined') return 'Não foi possível concluir a operação.'
  return message
}

function linkedAccountKey(account: LinkedAccountWithMetadata): string {
  switch (account.type) {
    case 'email':
      return `email:${account.address}`
    case 'google_oauth':
      return `google:${account.subject}`
    case 'github_oauth':
      return `github:${account.subject}`
    case 'discord_oauth':
      return `discord:${account.subject}`
    case 'passkey':
      return `passkey:${account.credentialId}`
    default:
      return account.type
  }
}

export function AccountSettingsPage() {
  const { user, getAccessToken, logout, ready } = usePrivy()
  const { linkEmail, linkGoogle, linkGithub, linkDiscord, linkPasskey } =
    useLinkAccount({
      onSuccess: () => setToast('Conta vinculada.'),
      onError: (error) => setError(privyErrorMessage(error)),
    })
  const { unlink: unlinkOAuth } = useUnlinkOAuth()
  const { unlink: unlinkEmail } = useUnlinkEmail()
  const { unlink: unlinkPasskey } = useUnlinkPasskey()

  const [linkedOpen, setLinkedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const label = user ? displayName(user) : '—'
  const linked = portalLinkedAccounts(user)
  const allowUnlink = canUnlinkLinkedAccount(user)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  function linkProvider(provider: LinkableProvider) {
    setError(null)
    switch (provider) {
      case 'email':
        linkEmail()
        break
      case 'google':
        linkGoogle()
        break
      case 'github':
        linkGithub()
        break
      case 'discord':
        linkDiscord()
        break
      case 'passkey':
        linkPasskey()
        break
    }
  }

  async function unlinkAccount(account: LinkedAccountWithMetadata) {
    if (!allowUnlink) {
      setError('Tem de manter pelo menos uma conta vinculada.')
      return
    }
    setUnlinking(true)
    setError(null)
    try {
      switch (account.type) {
        case 'email':
          await unlinkEmail({ address: account.address })
          break
        case 'google_oauth':
          await unlinkOAuth({ provider: 'google', subject: account.subject })
          break
        case 'github_oauth':
          await unlinkOAuth({ provider: 'github', subject: account.subject })
          break
        case 'discord_oauth':
          await unlinkOAuth({ provider: 'discord', subject: account.subject })
          break
        case 'passkey':
          await unlinkPasskey({ credentialId: account.credentialId })
          break
        default:
          break
      }
      setToast('Conta desvinculada.')
    } catch (err) {
      setError(privyErrorMessage(err))
    } finally {
      setUnlinking(false)
    }
  }

  const deleteAccount = useCallback(async () => {
    if (
      !window.confirm(
        'Apagar permanentemente a sua conta Work4You? Esta ação não pode ser desfeita.',
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Sessão expirada. Volte a iniciar sessão.')
        return
      }
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = (await res.json().catch(() => ({}))) as {
        error_description?: string
      }
      if (!res.ok) {
        setError(
          typeof body.error_description === 'string'
            ? body.error_description
            : 'Não foi possível apagar a conta.',
        )
        return
      }
      await logout()
    } catch {
      setError('Não foi possível contactar o Portal.')
    } finally {
      setDeleting(false)
    }
  }, [getAccessToken, logout])

  const unlinkableProviders = LINKABLE_PROVIDERS.filter(
    (p) => !isProviderLinked(user, p.id),
  )

  return (
    <OrgPage
      eyebrow="Account Settings"
      title="Definições da conta"
      lead="Gerir login, contas vinculadas e apagar a sua conta pessoal."
    >
      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Identidade</h2>
        <p className={pageStyles.panelText}>
          <strong>{label}</strong>
        </p>
        {user?.id ? (
          <p className={pageStyles.panelText} style={{ marginTop: '0.5rem' }}>
            ID: {user.id}
          </p>
        ) : null}
      </section>

      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Login</h2>
        <p className={pageStyles.panelText}>
          Gerir os métodos de início de sessão associados à sua conta.
        </p>
        <div className={styles.quickLinks}>
          <button
            type="button"
            className={styles.quickLink}
            onClick={() => setLinkedOpen(true)}
            disabled={!ready || !user}
          >
            <span aria-hidden="true">🔗</span>
            Contas vinculadas
          </button>
        </div>
      </section>

      <section className={styles.dangerPanel} aria-labelledby="danger-title">
        <h2 id="danger-title" className={styles.dangerTitle}>
          Zona de perigo
        </h2>
        <p className={styles.dangerText}>
          Apague permanentemente a sua conta pessoal. Remove a org pessoal,
          dashboards locais, chaves de API e sessões OAuth associadas.
        </p>
        <button
          type="button"
          className={styles.dangerLink}
          disabled={deleting || !user}
          onClick={() => void deleteAccount()}
        >
          {deleting ? 'A apagar…' : 'Apagar conta'}
        </button>
      </section>

      {linkedOpen ? (
        <>
          <div
            className={styles.drawerBackdrop}
            role="presentation"
            onClick={() => !unlinking && setLinkedOpen(false)}
          />
          <aside
            className={styles.drawer}
            role="dialog"
            aria-labelledby="linked-accounts-title"
          >
            <button
              type="button"
              className={styles.drawerClose}
              aria-label="Fechar"
              onClick={() => !unlinking && setLinkedOpen(false)}
            >
              ×
            </button>
            <p className={styles.drawerEyebrow}>{'// Conta'}</p>
            <h3 id="linked-accounts-title" className={styles.drawerTitle}>
              Contas vinculadas
            </h3>
            <p className={styles.drawerLead}>
              Vincule contas adicionais para facilitar o login e a recuperação.
              Pode usar qualquer conta vinculada para aceder ao Portal.
            </p>

            <section className={styles.drawerSection}>
              <h4 className={styles.drawerSectionTitle}>
                As suas contas vinculadas
              </h4>
              {linked.length === 0 ? (
                <p className={pageStyles.panelText}>
                  Nenhuma conta vinculada nesta sessão.
                </p>
              ) : (
                <ul className={styles.linkedList}>
                  {linked.map((account) => (
                    <li key={linkedAccountKey(account)}>
                      <div className={styles.linkedRow}>
                        <div className={styles.linkedMeta}>
                          <p className={styles.linkedKind}>
                            {linkedAccountKind(account)}
                          </p>
                          <p className={styles.linkedValue}>
                            {linkedAccountLabel(account)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.unlinkBtn}
                          disabled={!allowUnlink || unlinking}
                          title={
                            allowUnlink
                              ? 'Desvincular'
                              : 'Mantenha pelo menos uma conta vinculada'
                          }
                          onClick={() => void unlinkAccount(account)}
                        >
                          Desvincular
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {unlinkableProviders.length > 0 ? (
              <section className={styles.drawerSection}>
                <h4 className={styles.drawerSectionTitle}>
                  Vincular outra conta
                </h4>
                <div className={styles.linkOptions}>
                  {unlinkableProviders.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => linkProvider(provider.id)}
                    >
                      {provider.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </OrgPage>
  )
}
