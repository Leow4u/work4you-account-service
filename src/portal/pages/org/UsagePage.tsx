import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

export function UsagePage() {
  return (
    <OrgPage
      eyebrow="Usage"
      title="Utilização"
      lead="Inferência, hosting Cloud e ferramentas — dados vindos do NAS / billing."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Últimos 7 dias</h2>
        <p className={pageStyles.panelText}>
          Ainda sem telemetria ligada. Esta página mantém o sítio no menu do
          Portal autenticado.
        </p>
      </section>
    </OrgPage>
  )
}
