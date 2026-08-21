import type { ReactNode } from 'react'
import styles from './OrgPage.module.css'

interface OrgPageProps {
  eyebrow: string
  title: string
  lead?: string
  children?: ReactNode
}

export function OrgPage({ eyebrow, title, lead, children }: OrgPageProps) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
      </header>
      {children ? <div className={styles.body}>{children}</div> : null}
    </article>
  )
}
