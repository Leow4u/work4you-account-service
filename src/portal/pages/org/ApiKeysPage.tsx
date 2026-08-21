import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'

export function ApiKeysPage() {
  return (
    <OrgPage
      eyebrow="API keys"
      title="Chaves de API"
      lead="Crie e revogue chaves para o Portal / inference. Persistência e emissão ficam no NAS."
    >
      <section className={pageStyles.panel}>
        <h2 className={pageStyles.panelTitle}>Sem chaves ainda</h2>
        <p className={pageStyles.panelText}>
          Quando o account-service estiver no ar, a lista e o botão de criar
          chave aparecem aqui.
        </p>
        <div className={pageStyles.actions}>
          <button type="button" className={pageStyles.primary} disabled>
            Criar chave
          </button>
        </div>
      </section>
    </OrgPage>
  )
}
