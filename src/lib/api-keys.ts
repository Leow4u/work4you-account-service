/**
 * Portal static API keys (`sk-work4you-…`) for inference-api / playground.
 * Plaintext secret is returned only at create time; DB stores SHA-256.
 */
import { randomBytes } from 'crypto'
import type { ApiKey } from '@prisma/client'
import { prisma } from './db'
import { sha256 } from './crypto'
import { moneyAdd } from './tiers'

export const API_KEY_PREFIX = 'sk-work4you-'

export type ApiKeyPublic = {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  createdLabel: string
  lastUsedAt: string | null
  lastUsedLabel: string
  totalSpentUsd: string
  totalSpentLabel: string
}

function formatPtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

function formatRelative(d: Date | null): string {
  if (!d) return '—'
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (sec < 60) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h`
  const days = Math.floor(h / 24)
  return `${days}d`
}

function formatSpend(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return '$0'
  if (n < 0.01) return `$${n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
  return `$${n.toFixed(2)}`
}

export function toApiKeyPublic(row: ApiKey): ApiKeyPublic {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    createdLabel: formatPtDate(row.createdAt),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    lastUsedLabel: formatRelative(row.lastUsedAt),
    totalSpentUsd: row.totalSpentUsd,
    totalSpentLabel: formatSpend(row.totalSpentUsd),
  }
}

/** Generate opaque secret; prefix for UI masking. */
export function mintApiKeySecret(): { secret: string; keyPrefix: string; keyHash: string } {
  const body = randomBytes(24).toString('base64url')
  const secret = `${API_KEY_PREFIX}${body}`
  const keyHash = sha256(secret)
  const keyPrefix = `${secret.slice(0, 18)}…${secret.slice(-4)}`
  return { secret, keyPrefix, keyHash }
}

export async function listOrgApiKeys(orgId: string): Promise<ApiKeyPublic[]> {
  const rows = await prisma.apiKey.findMany({
    where: { orgId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toApiKeyPublic)
}

export async function createOrgApiKey(params: {
  orgId: string
  name?: string
}): Promise<{ key: ApiKeyPublic; secret: string }> {
  const name = (params.name?.trim() || 'Chave de API').slice(0, 80)
  const { secret, keyPrefix, keyHash } = mintApiKeySecret()
  const row = await prisma.apiKey.create({
    data: {
      orgId: params.orgId,
      name,
      keyHash,
      keyPrefix,
    },
  })
  return { key: toApiKeyPublic(row), secret }
}

export async function renameOrgApiKey(params: {
  orgId: string
  keyId: string
  name: string
}): Promise<ApiKeyPublic | null> {
  const name = params.name.trim().slice(0, 80)
  if (!name) return null
  const existing = await prisma.apiKey.findFirst({
    where: { id: params.keyId, orgId: params.orgId, revokedAt: null },
  })
  if (!existing) return null
  const row = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { name },
  })
  return toApiKeyPublic(row)
}

export async function revokeOrgApiKey(params: {
  orgId: string
  keyId: string
}): Promise<boolean> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: params.keyId, orgId: params.orgId, revokedAt: null },
  })
  if (!existing) return false
  await prisma.apiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  })
  return true
}

export type ResolvedApiKey = {
  keyId: string
  orgId: string
  name: string
}

/** Resolve a Bearer sk-work4you-… secret to org + key id. */
export async function resolveApiKeySecret(
  token: string,
): Promise<ResolvedApiKey | null> {
  const secret = token.trim()
  if (!secret.startsWith(API_KEY_PREFIX)) return null
  const keyHash = sha256(secret)
  const row = await prisma.apiKey.findUnique({ where: { keyHash } })
  if (!row || row.revokedAt) return null
  return { keyId: row.id, orgId: row.orgId, name: row.name }
}

/** After inference debit: bump lastUsed + accumulate spend on the key. */
export async function recordApiKeySpend(params: {
  keyId: string
  amountUsd: string
}): Promise<void> {
  const row = await prisma.apiKey.findUnique({ where: { id: params.keyId } })
  if (!row || row.revokedAt) return
  const amount = params.amountUsd.trim() || '0'
  await prisma.apiKey.update({
    where: { id: row.id },
    data: {
      lastUsedAt: new Date(),
      totalSpentUsd:
        amount === '0' || amount === '0.0' || amount === '0.00'
          ? row.totalSpentUsd
          : moneyAdd(row.totalSpentUsd, amount),
    },
  })
}

export async function touchApiKeyUsed(keyId: string): Promise<void> {
  await recordApiKeySpend({ keyId, amountUsd: '0' })
}
