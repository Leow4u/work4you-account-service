import { usePrivy } from '@privy-io/react-auth'
import { OrgPage } from '../../components/OrgPage'
import { displayName } from '../../lib/auth-display'
import pageStyles from '../../components/OrgPage.module.css'

export function AccountSettingsPage() {
  const { user } = usePrivy()
  const label = user ? displayName(user) : '—'

  return (
    <OrgPage
      eyebrow="Account Settings"
      title="Definições da conta"
      lead="Identidade Privy nesta sessão. Perfil org, membros e papéis virão do NAS."
    >
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
    </OrgPage>
  )
}
