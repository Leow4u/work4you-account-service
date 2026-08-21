import { PrivyClient } from '@privy-io/server-auth'
import { prisma } from './db'
import { personalOrgSlug } from './org'

function privy() {
  const appId = process.env.PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) throw new Error('PRIVY_APP_ID / PRIVY_APP_SECRET missing')
  return new PrivyClient(appId, appSecret)
}

export async function verifyPrivyBearer(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null
  try {
    const claims = await privy().verifyAuthToken(token)
    return claims
  } catch {
    return null
  }
}

/** Ensure User + personal Org exist for a Privy DID. */
export async function ensureUserAndOrg(privyDid: string, email?: string | null) {
  const slug = personalOrgSlug(privyDid)
  let user = await prisma.user.findUnique({ where: { privyDid } })
  if (!user) {
    user = await prisma.user.create({
      data: { privyDid, email: email || null },
    })
  } else if (email && user.email !== email) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email },
    })
  }

  let org = await prisma.org.findUnique({ where: { slug } })
  if (!org) {
    org = await prisma.org.create({
      data: {
        slug,
        name: 'Conta pessoal',
        personal: true,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    })
  } else {
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    })
    if (!member) {
      await prisma.orgMember.create({
        data: { orgId: org.id, userId: user.id, role: 'OWNER' },
      })
    }
  }

  return { user, org }
}
