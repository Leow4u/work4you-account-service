'use client'

import { usePrivy } from '@privy-io/react-auth'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PortalShell } from './components/PortalShell'
import { RequirePersonalOrg } from './components/RequireAuth'
import { personalOrgId } from './lib/org'
import { DeviceApprovePage } from './pages/DeviceApprovePage'
import { LoginPage } from './pages/LoginPage'
import { AccountSettingsPage } from './pages/org/AccountSettingsPage'
import { AgentHomePage } from './pages/org/AgentHomePage'
import { ApiKeysPage } from './pages/org/ApiKeysPage'
import { BillingPage } from './pages/org/BillingPage'
import { CloudPage } from './pages/org/CloudPage'
import { InfoPage } from './pages/org/InfoPage'
import { LocalDashboardsPage } from './pages/org/LocalDashboardsPage'
import { UsagePage } from './pages/org/UsagePage'

/** `/billing?topup=open` → `/orgs/{personal}/billing?topup=open` */
function BillingDeepLink() {
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
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }
  const slug = personalOrgId(user.id)
  return (
    <Navigate to={`/orgs/${slug}/billing${location.search}`} replace />
  )
}

export default function PortalApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage initialMode="signup" />} />
      <Route path="/device" element={<DeviceApprovePage />} />
      <Route path="/billing" element={<BillingDeepLink />} />

      <Route
        path="/orgs/:orgId"
        element={
          <RequirePersonalOrg>
            <PortalShell />
          </RequirePersonalOrg>
        }
      >
        <Route index element={<AgentHomePage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="agents" element={<CloudPage />} />
        <Route path="local-dashboards" element={<LocalDashboardsPage />} />
        <Route path="settings" element={<AccountSettingsPage />} />
        <Route path="info" element={<InfoPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
