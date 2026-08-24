import type { LinkedAccountWithMetadata, User } from '@privy-io/react-auth'

export type LinkableProvider = 'email' | 'google' | 'github' | 'discord' | 'passkey'

export const LINKABLE_PROVIDERS: Array<{
  id: LinkableProvider
  label: string
}> = [
  { id: 'email', label: 'E-mail' },
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
  { id: 'discord', label: 'Discord' },
  { id: 'passkey', label: 'Chave de acesso' },
]

const PORTAL_LINK_TYPES = new Set([
  'email',
  'google_oauth',
  'github_oauth',
  'discord_oauth',
  'passkey',
])

export function portalLinkedAccounts(
  user: User | null | undefined,
): LinkedAccountWithMetadata[] {
  if (!user?.linkedAccounts?.length) return []
  return user.linkedAccounts.filter((a) => PORTAL_LINK_TYPES.has(a.type))
}

export function linkedAccountLabel(account: LinkedAccountWithMetadata): string {
  switch (account.type) {
    case 'email':
      return account.address
    case 'google_oauth':
      return account.email || 'Google'
    case 'github_oauth':
      return account.username || account.email || 'GitHub'
    case 'discord_oauth':
      return account.username || 'Discord'
    case 'passkey':
      return account.authenticatorName || 'Chave de acesso'
    default:
      return account.type
  }
}

export function linkedAccountKind(
  account: LinkedAccountWithMetadata,
): string {
  switch (account.type) {
    case 'email':
      return 'E-mail'
    case 'google_oauth':
      return 'Google'
    case 'github_oauth':
      return 'GitHub'
    case 'discord_oauth':
      return 'Discord'
    case 'passkey':
      return 'Chave de acesso'
    default:
      return account.type
  }
}

export function isProviderLinked(
  user: User | null | undefined,
  provider: LinkableProvider,
): boolean {
  if (!user?.linkedAccounts?.length) return false
  const type =
    provider === 'email'
      ? 'email'
      : provider === 'google'
        ? 'google_oauth'
        : provider === 'github'
          ? 'github_oauth'
          : provider === 'discord'
            ? 'discord_oauth'
            : 'passkey'
  return user.linkedAccounts.some((a) => a.type === type)
}

export function canUnlinkLinkedAccount(user: User | null | undefined): boolean {
  return portalLinkedAccounts(user).length > 1
}
