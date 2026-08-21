/**
 * OpenRouter usage → Portal Usage meters (Hermes card fields).
 * Source: usage.prompt_tokens / completion_tokens /
 * prompt_tokens_details.cached_tokens / cache_write_tokens.
 */
export type UsageMeters = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function emptyUsageMeters(): UsageMeters {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

function asNonNegInt(n: unknown): number {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function normalizeUsageMeters(
  raw: Partial<UsageMeters> | null | undefined,
): UsageMeters {
  if (!raw) return emptyUsageMeters()
  return {
    inputTokens: asNonNegInt(raw.inputTokens),
    outputTokens: asNonNegInt(raw.outputTokens),
    cacheReadTokens: asNonNegInt(raw.cacheReadTokens),
    cacheWriteTokens: asNonNegInt(raw.cacheWriteTokens),
  }
}

export function metersHaveTokens(m: UsageMeters): boolean {
  return (
    m.inputTokens > 0 ||
    m.outputTokens > 0 ||
    m.cacheReadTokens > 0 ||
    m.cacheWriteTokens > 0
  )
}

/** Parse OpenRouter (or OpenAI-shaped) usage object. */
export function metersFromOpenRouterUsage(
  usage: Record<string, unknown> | null | undefined,
): UsageMeters {
  if (!usage) return emptyUsageMeters()
  const details =
    usage.prompt_tokens_details &&
    typeof usage.prompt_tokens_details === 'object'
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : null
  return {
    inputTokens: asNonNegInt(usage.prompt_tokens),
    outputTokens: asNonNegInt(usage.completion_tokens),
    cacheReadTokens: asNonNegInt(
      details?.cached_tokens ?? usage.cache_read_tokens,
    ),
    cacheWriteTokens: asNonNegInt(
      details?.cache_write_tokens ?? usage.cache_write_tokens,
    ),
  }
}
