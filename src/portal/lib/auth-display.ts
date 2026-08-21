/** Display label for a Privy user — email / OAuth handle / id. */
export function displayName(user: {
  id: string
  email?: { address?: string | null } | null
  google?: { email?: string | null } | null
  github?: { username?: string | null; email?: string | null } | null
  discord?: { username?: string | null } | null
}): string {
  const email = user.email?.address
  if (email) return email
  const google = user.google?.email
  if (google) return google
  const github = user.github?.username || user.github?.email
  if (github) return github
  const discord = user.discord?.username
  if (discord) return discord
  return user.id
}
