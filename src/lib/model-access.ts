/**
 * Free vs paid model access.
 * Plus/Super/Ultra unlock the official catalog; Free unlocks Operis only.
 */
import type { Org } from '@prisma/client'
import { getTier } from './tiers'

export type ModelPricing = { prompt?: string; completion?: string }

export type AnnotatedModel = {
  id: string
  name: string
  free: boolean
  locked: boolean
  pricing?: ModelPricing
}

/** Billed house model on Free. Ceiling is existing NAS authorize/debit. */
export const HOUSE_MODEL_ID = 'deepseek/deepseek-v4-flash-0731'
export const HOUSE_MODEL_DISPLAY = 'Operis 4.0 Flash'

/** Official Work4You catalog — same 31 ids as `_PROVIDER_MODELS["work4you"]`. */
export const OFFICIAL_WORK4YOU_MODEL_IDS: readonly string[] = [
  'anthropic/claude-fable-5',
  'anthropic/claude-opus-5',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'openai/gpt-5.4-mini',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.7-flash',
  'x-ai/grok-4.6',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-pro-0813',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-flash-0731',
  'qwen/qwen3.8-max',
  'moonshotai/kimi-k3',
  'minimax/minimax-m3',
  'z-ai/glm-5.2',
  'z-ai/glm-5.1',
  'xiaomi/mimo-v2.5-pro',
  'tencent/hy3',
  'stepfun/step-3.7-flash',
  'nvidia/nemotron-3-super-120b-a12b',
  'sakana/fugu-ultra',
]

export const OFFICIAL_PAID_VISION_MODEL = 'google/gemini-3.7-flash'
export const OFFICIAL_PAID_COMPACTION_MODEL = 'openai/gpt-5.4-mini'

export function isHouseModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase()
  return id === HOUSE_MODEL_ID || id.endsWith('/deepseek-v4-flash-0731')
}

export function isOfficialWork4YouModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase()
  return OFFICIAL_WORK4YOU_MODEL_IDS.some((official) => official.toLowerCase() === id)
}

export function officialModelDisplayName(modelId: string): string {
  return isHouseModel(modelId) ? HOUSE_MODEL_DISPLAY : modelId
}

export function isAllowedOnFreePlan(
  modelId: string,
  _pricing?: ModelPricing | null,
): boolean {
  return isHouseModel(modelId)
}

/** Paid subscription (Plus/Super/Ultra) — not the Free plan. */
export function orgHasPaidPlan(org: Org): boolean {
  const tier = getTier(org.subscriptionTierId || 'free')
  return tier.tierId !== 'free'
}

export function isZeroPrice(pricing: ModelPricing | null | undefined): boolean {
  if (!pricing) return false
  const p = Number(pricing.prompt ?? NaN)
  const c = Number(pricing.completion ?? NaN)
  return Number.isFinite(p) && Number.isFinite(c) && p === 0 && c === 0
}

/** Legacy $0 / :free detector — not the Free-plan unlock (Operis is). */
export function isModelFreeForPlan(
  modelId: string,
  pricing?: ModelPricing | null,
): boolean {
  const id = modelId.toLowerCase()
  if (id.includes(':free') || id.endsWith('/free')) return true
  return isZeroPrice(pricing || undefined)
}

export function annotateModels(params: {
  models: Array<{ id: string; name?: string; pricing?: ModelPricing }>
  paidPlan: boolean
}): AnnotatedModel[] {
  const out: AnnotatedModel[] = []
  for (const m of params.models) {
    if (!m?.id) continue
    const house = isHouseModel(m.id)
    out.push({
      id: m.id,
      name: house ? HOUSE_MODEL_DISPLAY : m.name || m.id,
      free: false,
      locked: !params.paidPlan && !house,
      pricing: m.pricing,
    })
  }
  // Unlocked first (Operis on Free); otherwise keep official catalog order.
  out.sort((a, b) => Number(a.locked) - Number(b.locked))
  return out
}

export function pickDefaultUnlocked(models: AnnotatedModel[]): string {
  const house = models.find((m) => isHouseModel(m.id) && !m.locked)
  if (house) return house.id
  const first = models.find((m) => !m.locked)
  return first?.id || HOUSE_MODEL_ID
}
