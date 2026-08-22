/**
 * Work4You Cloud instance sizes (Hermes parity, display + Fly Machines shape).
 * Prices are estimate-only for the Create modal until billing meters land.
 */

export type CloudSizeId = 'small' | 'medium' | 'large'

export type CloudSizeSpec = {
  id: CloudSizeId
  label: string
  maxSessions: number
  memoryMb: number
  /** Fly shared CPU count (shared-cpu-Nx). */
  cpus: number
  diskGb: number
  /** Display $/day while running. */
  priceRunningUsd: string
  /** Display $/day while stopped (storage). */
  priceStoppedUsd: string
  blurb: string
}

export const CLOUD_SIZES: Record<CloudSizeId, CloudSizeSpec> = {
  small: {
    id: 'small',
    label: 'Pequeno',
    maxSessions: 5,
    memoryMb: 1024,
    cpus: 2,
    diskGb: 10,
    priceRunningUsd: '1.20',
    priceStoppedUsd: '0.15',
    blurb: '5 sessões · 1 GB RAM · 2 vCPUs · 10 GB disco',
  },
  medium: {
    id: 'medium',
    label: 'Médio',
    maxSessions: 10,
    memoryMb: 2048,
    cpus: 4,
    diskGb: 20,
    priceRunningUsd: '2.40',
    priceStoppedUsd: '0.30',
    blurb: '10 sessões · 2 GB RAM · 4 vCPUs · 20 GB disco',
  },
  large: {
    id: 'large',
    label: 'Grande',
    maxSessions: 20,
    memoryMb: 4096,
    cpus: 8,
    diskGb: 40,
    priceRunningUsd: '4.80',
    priceStoppedUsd: '0.60',
    blurb: '20 sessões · 4 GB RAM · 8 vCPUs · 40 GB disco',
  },
}

export function parseCloudSize(raw: unknown): CloudSizeId {
  const s = String(raw || '').toLowerCase()
  if (s === 'medium' || s === 'large' || s === 'small') return s
  return 'small'
}

export function flyGuestForSize(size: CloudSizeId) {
  const spec = CLOUD_SIZES[size]
  return {
    cpu_kind: 'shared' as const,
    cpus: spec.cpus,
    memory_mb: spec.memoryMb,
  }
}
