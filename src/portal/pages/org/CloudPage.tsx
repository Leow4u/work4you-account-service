import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

/** Fork route: `/orgs/:orgId/agents` — Hermes Cloud → Work4You Cloud. */
export function CloudPage() {
  return (
    <OrgPage
      eyebrow="Work4You Cloud"
      title="Work4You Cloud"
      lead="Agent hospedado pela Work4You. Crie uma VM Small, Medium ou Large e abra o dashboard."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Instâncias</h2>
        <p className={pageStyles.panelText}>
          Nenhuma instância nesta org. A criação entra quando o account-service
          estiver ligado; o botão já está no sítio da UI.
        </p>
        <div className={pageStyles.actions}>
          <button type="button" className={pageStyles.primary} disabled>
            + Create
          </button>
        </div>
        <ul className={pageStyles.list}>
          <li>Small — 5 sessões, 1GB RAM, 2 vCPUs</li>
          <li>Medium — 10 sessões, 2GB RAM, 4 vCPUs</li>
          <li>Large — 20 sessões, 4GB RAM, 8 vCPUs</li>
        </ul>
      </section>
    </OrgPage>
  )
}
