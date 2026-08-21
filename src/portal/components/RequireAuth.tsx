import { usePrivy } from '@privy-io/react-auth'
import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { personalOrgId } from '../lib/org'

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { ready, authenticated, user } = usePrivy()
  const location = useLocation()

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--grafite)', margin: 0 }}>Carregando…</p>
      </div>
    )
  }

  if (!authenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

/**
 * Until NAS supplies real org membership, keep the URL on the provisional
 * personal org derived from the Privy user id.
 */
export function RequirePersonalOrg({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy()
  const { orgId = '' } = useParams()
  const location = useLocation()

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--grafite)', margin: 0 }}>Carregando…</p>
      </div>
    )
  }

  if (!authenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const mine = personalOrgId(user.id)
  if (orgId && orgId !== mine) {
    const rest = location.pathname.replace(/^\/orgs\/[^/]+/, '') || ''
    return <Navigate to={`/orgs/${mine}${rest}${location.search}`} replace />
  }

  return <>{children}</>
}
