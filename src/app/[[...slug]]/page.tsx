'use client'

import dynamic from 'next/dynamic'

/** Privy + react-router touch `document` — never SSR. */
const ClientPortal = dynamic(
  () => import('../ClientPortal').then((m) => m.ClientPortal),
  { ssr: false },
)

/** Catch-all SPA routes (login, orgs, device). API lives under /api. */
export default function SpaPage() {
  return <ClientPortal />
}
