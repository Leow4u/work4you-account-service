import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

export function InfoPage() {
  return (
    <OrgPage
      eyebrow="Info"
      title="Sobre o Portal"
      lead="Portal autenticado por organização — conta, billing e Cloud num só sítio."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Rotas</h2>
        <ul className={pageStyles.list}>
          <li>
            <code>/orgs/:orgId</code> — Work4You Agent
          </li>
          <li>
            <code>/orgs/:orgId/agents</code> — Work4You Cloud
          </li>
          <li>
            <code>/orgs/:orgId/billing</code> — Billing
          </li>
        </ul>
      </section>
    </OrgPage>
  )
}
