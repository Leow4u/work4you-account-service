import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

export function LocalDashboardsPage() {
  return (
    <OrgPage
      eyebrow="Local Dashboards"
      title="Dashboards locais"
      lead="Ligue gateways self-hosted ao Portal. O Desktop já descobre Cloud via GET /api/agents; locais registam-se à parte."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Nenhum dashboard registado</h2>
        <p className={pageStyles.panelText}>
          Quando o NAS expuser o registo de dashboards, a lista entra aqui.
        </p>
      </section>
    </OrgPage>
  )
}
