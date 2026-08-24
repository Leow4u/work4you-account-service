'use client'

import { Link, useParams } from 'react-router-dom'
import { OrgPage } from '../../components/OrgPage'
import pageStyles from '../../components/OrgPage.module.css'
import {
  AGENTIC_MODEL_SUGGESTIONS,
  EXTERNAL_LINKS,
  TOOL_GATEWAY_ROWS,
  WORK4YOU_4_MODELS,
} from '../../lib/info-content'
import { PORTAL_NAV, navPath } from '../../lib/portal-nav'
import styles from './InfoPage.module.css'

export function InfoPage() {
  const { orgId = '' } = useParams()

  return (
    <OrgPage
      eyebrow="Info"
      title="Sobre o Portal"
      lead="Subscrição unificada, modelos agentic, Tool Gateway e superfícies da conta num só sítio."
    >
      <div className={styles.stack}>
        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>O Portal</h2>
          <p className={pageStyles.panelText}>
            O Work4You Portal é a forma recomendada de correr o agente: um login
            OAuth substitui dezenas de API keys, a inferência passa pela sua
            subscrição e o Tool Gateway encaminha pesquisa web, imagens, TTS e
            browser sem contas separadas.
          </p>
        </section>

        <section className={styles.warnPanel} aria-labelledby="w4y4-warning">
          <h2 id="w4y4-warning" className={styles.warnTitle}>
            Work4You 4 — não use no agente
          </h2>
          <p className={pageStyles.panelText}>
            A família <strong>Work4You 4</strong> está disponível no Portal com
            tarifas reduzidas, mas é para <strong>chat e raciocínio</strong>, não
            para o ciclo rápido de tool calling do agente. Use-as em fluxos de
            conversa ou via{' '}
            <a
              className={styles.extLink}
              href="https://work4you.ai/docs/user-guide/features/subscription-proxy"
              target="_blank"
              rel="noreferrer"
            >
              subscription proxy
            </a>
            ; para trabalho no Work4You, escolha um modelo agentic abaixo.
          </p>
          <ul className={styles.monoList}>
            {WORK4YOU_4_MODELS.map((model) => (
              <li key={model}>
                <code>{model}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>
            Modelos recomendados para o agente
          </h2>
          <p className={pageStyles.panelText}>
            Sugestões oficiais para loops com ferramentas. Mude a qualquer
            momento com <code>/model</code> na sessão ou{' '}
            <code>work4you model</code> no terminal.
          </p>
          <ul className={styles.modelList}>
            {AGENTIC_MODEL_SUGGESTIONS.map((row) => (
              <li key={row.id} className={styles.modelRow}>
                <p className={styles.modelId}>{row.id}</p>
                <p className={styles.modelNote}>
                  {row.label} — {row.note}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>Tool Gateway</h2>
          <p className={pageStyles.panelText}>
            Com subscrição ativa, estas capacidades podem ser encaminhadas pelo
            Portal em vez de API keys próprias.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Ferramenta</th>
                  <th scope="col">Parceiro</th>
                </tr>
              </thead>
              <tbody>
                {TOOL_GATEWAY_ROWS.map((row) => (
                  <tr key={row.tool}>
                    <td>{row.tool}</td>
                    <td>{row.partner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>Começar no terminal</h2>
          <p className={pageStyles.panelText}>
            Login OAuth, provider Work4You e Tool Gateway num único comando:
          </p>
          <pre className={styles.codeBlock}>work4you setup --portal</pre>
          <p className={pageStyles.panelText} style={{ marginTop: '0.65rem' }}>
            Para verificar o encaminhamento depois de configurado:{' '}
            <code>work4you portal info</code>
          </p>
        </section>

        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>Superfícies do Portal</h2>
          <p className={pageStyles.panelText}>
            Navegação da conta pessoal nesta org.
          </p>
          <ul className={styles.routeList}>
            {PORTAL_NAV.map((item) => (
              <li key={item.id}>
                <Link
                  className={styles.routeLink}
                  to={navPath(orgId, item.segment)}
                >
                  <span>{item.label}</span>
                  <span className={styles.routePath}>
                    {item.segment
                      ? `/orgs/:orgId/${item.segment}`
                      : '/orgs/:orgId'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={pageStyles.panel}>
          <h2 className={pageStyles.panelTitle}>Links úteis</h2>
          <ul className={styles.linkList}>
            {EXTERNAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={styles.extLink}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </OrgPage>
  )
}
