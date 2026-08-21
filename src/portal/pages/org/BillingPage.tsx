import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

export function BillingPage() {
  return (
    <OrgPage
      eyebrow="Billing"
      title="Créditos e faturação"
      lead="Saldo, top-up e planos ligam-se ao work4you-account-service (NAS) e ao Stripe — o CLI já espera /orgs/{slug}/billing."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Estado</h2>
        <p className={pageStyles.panelText}>
          Sem NAS ligado: saldo e cobranças ainda não estão disponíveis nesta
          superfície. A rota e a org já existem para encaixar a API.
        </p>
        <div className={pageStyles.actions}>
          <button type="button" className={pageStyles.primary} disabled>
            Comprar créditos
          </button>
        </div>
      </section>
    </OrgPage>
  )
}
