/** Provisional personal org slug from Privy DID — same rule as the old SPA. */
export function personalOrgSlug(userId: string): string {
  const raw = userId.replace(/^did:privy:/i, '').replace(/[^a-zA-Z0-9]/g, '')
  return (raw.slice(0, 12) || 'personal').toLowerCase()
}

export function orgHomePath(orgId: string): string {
  return `/orgs/${orgId}`
}
