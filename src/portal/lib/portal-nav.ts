/** Org-scoped nav — same surfaces as Hermes Portal, Work4You naming. */
export interface PortalNavItem {
  id: string
  label: string
  /** Path under `/orgs/:orgId` — empty = org home. */
  segment: string
}

export const PORTAL_NAV: PortalNavItem[] = [
  { id: 'agent', label: 'Work4You Agent', segment: '' },
  { id: 'billing', label: 'Billing', segment: 'billing' },
  { id: 'api-keys', label: 'API keys', segment: 'api-keys' },
  { id: 'usage', label: 'Usage', segment: 'usage' },
  { id: 'cloud', label: 'Work4You Cloud', segment: 'agents' },
  { id: 'local', label: 'Local Dashboards', segment: 'local-dashboards' },
  { id: 'settings', label: 'Account Settings', segment: 'settings' },
  { id: 'info', label: 'Info', segment: 'info' },
]

export function navPath(orgId: string, segment: string): string {
  return segment ? `/orgs/${orgId}/${segment}` : `/orgs/${orgId}`
}
