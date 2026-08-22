'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const OAuthAuthorizePage = dynamic(
  () =>
    import('@/portal/pages/OAuthAuthorizePage').then((m) => m.OAuthAuthorizePage),
  { ssr: false },
)

/** Agent dashboard OAuth consent (FORK dashboard_auth/work4you contract). */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <p style={{ margin: 0 }}>A carregar…</p>
        </div>
      }
    >
      <OAuthAuthorizePage />
    </Suspense>
  )
}
