'use client'

import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalShell } from './components/PortalShell'
import { RequirePersonalOrg } from './components/RequireAuth'
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

export default function PortalApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage initialMode="signup" />} />
      <Route path="/device" element={<DeviceApprovePage />} />

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
