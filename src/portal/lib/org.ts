/**
 * Provisional personal org until work4you-account-service (NAS) is wired.
 * Route shape matches the fork: `/orgs/{orgId}/…` (CLI billing links use the same).
 */
export function personalOrgId(userId: string): string {
  const raw = userId.replace(/^did:privy:/i, '').replace(/[^a-zA-Z0-9]/g, '')
  return (raw.slice(0, 12) || 'personal').toLowerCase()
}

export function orgHomePath(orgId: string): string {
  return `/orgs/${orgId}`
}
