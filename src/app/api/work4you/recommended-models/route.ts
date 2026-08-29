import { NextResponse } from 'next/server'

import {
  HOUSE_MODEL_ID,
  OFFICIAL_PAID_COMPACTION_MODEL,
  OFFICIAL_PAID_VISION_MODEL,
  OFFICIAL_WORK4YOU_MODEL_IDS,
  officialModelDisplayName,
} from '@/lib/model-access'

export const runtime = 'nodejs'

function catalogEntry(
  modelName: string,
  position: number,
  now: string,
  tokenPrice: string | null,
) {
  return {
    modelName,
    displayName: officialModelDisplayName(modelName),
    source: 'local',
    href: null,
    tokenPrice,
    contextLength: null,
    inputModalities: [] as string[],
    outputModalities: [] as string[],
    position,
    isVisionModel: false,
    isCompactionModel: false,
    updatedAt: now,
  }
}

/**
 * GET /api/work4you/recommended-models
 * Official Work4You catalog hints for CLI/Desktop pickers.
 * Free: Operis only. Paid: the 31-id manifesto.
 */
export async function GET() {
  const now = new Date().toISOString()
  const freeRecommendedModels = [HOUSE_MODEL_ID].map((modelName, position) =>
    catalogEntry(modelName, position, now, null),
  )

  const paidRecommendedModels = OFFICIAL_WORK4YOU_MODEL_IDS.map((modelName, position) =>
    catalogEntry(modelName, position, now, null),
  )

  const paidVision =
    paidRecommendedModels.find((m) => m.modelName === OFFICIAL_PAID_VISION_MODEL) ||
    paidRecommendedModels[0] ||
    null
  const paidCompaction =
    paidRecommendedModels.find((m) => m.modelName === OFFICIAL_PAID_COMPACTION_MODEL) ||
    paidRecommendedModels[0] ||
    null

  return NextResponse.json({
    paidRecommendedModels,
    freeRecommendedModels,
    paidRecommendedVisionModel: paidVision,
    paidRecommendedCompactionModel: paidCompaction,
    freeRecommendedVisionModel: freeRecommendedModels[0] || null,
    freeRecommendedCompactionModel: freeRecommendedModels[0] || null,
  })
}
