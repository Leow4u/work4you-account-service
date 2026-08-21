'use client'

import { ClientPortal } from '../ClientPortal'

/** Catch-all SPA routes (login, orgs, device). API lives under /api. */
export default function SpaPage() {
  return <ClientPortal />
}
