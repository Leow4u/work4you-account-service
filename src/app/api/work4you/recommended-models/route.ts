import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/work4you/recommended-models
 * Public catalog hints for CLI/Desktop free vs paid pickers (Hermes shape).
 * Live free set is still priced via inference /v1/models; this list is curated.
 */
export async function GET() {
  const now = new Date().toISOString()
  const freeRecommendedModels = [
    'openrouter/free',
    'deepseek/deepseek-chat:free',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ].map((modelName, position) => ({
    modelName,
    displayName: modelName,
    source: 'local',
    href: null,
    tokenPrice: '$0.00/1M',
    contextLength: null,
    inputModalities: [] as string[],
    outputModalities: [] as string[],
    position,
    isVisionModel: false,
    isCompactionModel: false,
    updatedAt: now,
  }))

  const paidRecommendedModels = [
    'openai/gpt-4o-mini',
    'google/gemini-2.5-flash',
    'anthropic/claude-sonnet-4',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-v4-flash',
    ...freeRecommendedModels.map((m) => m.modelName),
  ].map((modelName, position) => ({
    modelName,
    displayName: modelName,
    source: 'local',
    href: null,
    tokenPrice: null as string | null,
    contextLength: null,
    inputModalities: [] as string[],
    outputModalities: [] as string[],
    position,
    isVisionModel: false,
    isCompactionModel: false,
    updatedAt: now,
  }))

  return NextResponse.json({
    paidRecommendedModels,
    freeRecommendedModels,
    paidRecommendedVisionModel: paidRecommendedModels[1] || null,
    paidRecommendedCompactionModel: paidRecommendedModels[0] || null,
    freeRecommendedVisionModel: freeRecommendedModels[0] || null,
    freeRecommendedCompactionModel: freeRecommendedModels[0] || null,
  })
}
