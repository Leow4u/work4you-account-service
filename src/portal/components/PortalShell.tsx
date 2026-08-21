import { usePrivy } from '@privy-io/react-auth'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { displayName } from '../lib/auth-display'
import { PORTAL_NAV, navPath } from '../lib/portal-nav'
import styles from './PortalShell.module.css'

export function PortalShell() {
  const { orgId = '' } = useParams()
  const { user, logout } = usePrivy()
  const name = user ? displayName(user) : 'Conta'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Portal">
        <div className={styles.brandRow}>
          <a className={styles.brand} href="https://work4you.ai/" aria-label="Work4You">
            <img src="/brand/work4you-logo.png" alt="Work4You" width={140} height={14} />
          </a>
        </div>

        <div className={styles.account}>
          <p className={styles.accountName}>{name}</p>
          <p className={styles.accountMeta}>Conta pessoal</p>
        </div>

        <div className={styles.balance} aria-label="Saldo">
          <span className={styles.balanceLabel}>Saldo</span>
          <span className={styles.balanceValue}>—</span>
          <span className={styles.balanceHint}>Billing liga com o NAS</span>
        </div>

        <nav className={styles.nav} aria-label="Secções">
          {PORTAL_NAV.map((item) => (
            <NavLink
              key={item.id}
              to={navPath(orgId, item.segment)}
              end={item.segment === ''}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <a
            className={styles.footLink}
            href="https://work4you.ai/docs/"
            target="_blank"
            rel="noreferrer"
          >
            API Docs
          </a>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  )
}
