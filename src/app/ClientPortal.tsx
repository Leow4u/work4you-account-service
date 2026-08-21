'use client'

import { BrowserRouter } from 'react-router-dom'
import PortalApp from '@/portal/App'
import { PrivyAppProvider } from '@/portal/providers/PrivyAppProvider'

export function ClientPortal() {
  return (
    <PrivyAppProvider>
      <BrowserRouter>
        <PortalApp />
      </BrowserRouter>
    </PrivyAppProvider>
  )
}
