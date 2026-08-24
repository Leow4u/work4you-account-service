import { PrivyClient } from '@privy-io/server-auth'
import { prisma } from './db'

function privyClient() {
  const appId = process.env.PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('PRIVY_APP_ID / PRIVY_APP_SECRET missing')
  }
  return new PrivyClient(appId, appSecret)
}

async function deletePrivyUser(privyDid: string): Promise<void> {
  await privyClient().deleteUser(privyDid)
}

/**
 * Permanently delete a Portal personal account: personal org(s), NAS user row, Privy user.
 * Blocks when the user still belongs to a non-personal org.
 */
export async function deletePortalAccount(
  userId: string,
  privyDid: string,
): Promise<void> {
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    include: { org: true },
  })

  if (memberships.some((m) => !m.org.personal)) {
    throw new Error('has_team_memberships')
  }

  const personalOrgIds = memberships
    .filter((m) => m.org.personal)
    .map((m) => m.org.id)

  await prisma.$transaction(async (tx) => {
    if (personalOrgIds.length > 0) {
      await tx.org.deleteMany({ where: { id: { in: personalOrgIds } } })
    }
    await tx.oAuthSession.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })
  })

  await deletePrivyUser(privyDid)
}
