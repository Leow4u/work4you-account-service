/**
 * Inference debit — subscription credits first, then purchased top-up (Nous rule).
 * Called by inference-api via internal auth (not the CLI).
 *
 * Also records OpenRouter usage meters on the same BillingDebit row (Hermes Usage).
 * amountUsd may be 0 for free / zero-cost calls when tokens are present (meter-only).
 */
import type { Org } from '@prisma/client'
import { prisma } from './db'
import { moneyAdd, moneyCmp, moneySub, totalSpendable } from './tiers'
import {
  metersHaveTokens,
  normalizeUsageMeters,
  type UsageMeters,
} from './usage-meters'

export type DebitResult =
  | {
      status: 'settled'
      debitId: string
      amountUsd: string
      subscriptionTakenUsd: string
      purchasedTakenUsd: string
      subscriptionCreditsUsd: string
      purchasedCreditsUsd: string
      totalUsableCredits: string
      meters: UsageMeters
    }
  | {
      status: 'insufficient'
      reason: 'no_usable_credits'
      totalUsableCredits: string
      amountUsd: string
    }
  | {
      status: 'replay'
      debitId: string
      amountUsd: string
      subscriptionTakenUsd: string
      purchasedTakenUsd: string
      subscriptionCreditsUsd: string
      purchasedCreditsUsd: string
      totalUsableCredits: string
      meters: UsageMeters
    }

/** Inference needs sub-cent precision (Hermes shows $0.000000-style spend). */
function normUsd(n: number): string {
  const s = n.toFixed(6)
  return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') || '0'
}

function metersFromDebit(row: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): UsageMeters {
  return {
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    cacheReadTokens: row.cacheReadTokens || 0,
    cacheWriteTokens: row.cacheWriteTokens || 0,
  }
}

export async function debitOrgCredits(params: {
  org: Org
  amountUsd: number
  idempotencyKey: string
  purpose?: string | null
  meters?: Partial<UsageMeters> | null
}): Promise<DebitResult> {
  const amount = params.amountUsd
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('invalid_amount')
  }
  const meters = normalizeUsageMeters(params.meters)
  if (amount === 0 && !metersHaveTokens(meters)) {
    throw new Error('invalid_amount')
  }
  const amountUsd = amount === 0 ? '0' : normUsd(amount)
  const meterOnly = amount === 0

  const existing = await prisma.billingDebit.findUnique({
    where: {
      orgId_idempotencyKey: {
        orgId: params.org.id,
        idempotencyKey: params.idempotencyKey,
      },
    },
  })
  if (existing) {
    const org = await prisma.org.findUniqueOrThrow({
      where: { id: params.org.id },
    })
    return {
      status: 'replay',
      debitId: existing.id,
      amountUsd: existing.amountUsd,
      subscriptionTakenUsd: existing.subscriptionTakenUsd,
      purchasedTakenUsd: existing.purchasedTakenUsd,
      subscriptionCreditsUsd: org.subscriptionCreditsUsd,
      purchasedCreditsUsd: org.balanceUsd,
      totalUsableCredits: totalSpendable(
        org.subscriptionCreditsUsd,
        org.balanceUsd,
      ),
      meters: metersFromDebit(existing),
    }
  }

  // Serialize debits per org with a transaction + row lock via update.
  return prisma.$transaction(async (tx) => {
    const org = await tx.org.findUniqueOrThrow({
      where: { id: params.org.id },
    })

    const dup = await tx.billingDebit.findUnique({
      where: {
        orgId_idempotencyKey: {
          orgId: org.id,
          idempotencyKey: params.idempotencyKey,
        },
      },
    })
    if (dup) {
      return {
        status: 'replay' as const,
        debitId: dup.id,
        amountUsd: dup.amountUsd,
        subscriptionTakenUsd: dup.subscriptionTakenUsd,
        purchasedTakenUsd: dup.purchasedTakenUsd,
        subscriptionCreditsUsd: org.subscriptionCreditsUsd,
        purchasedCreditsUsd: org.balanceUsd,
        totalUsableCredits: totalSpendable(
          org.subscriptionCreditsUsd,
          org.balanceUsd,
        ),
        meters: metersFromDebit(dup),
      }
    }

    if (meterOnly) {
      const debit = await tx.billingDebit.create({
        data: {
          orgId: org.id,
          amountUsd: '0',
          subscriptionTakenUsd: '0',
          purchasedTakenUsd: '0',
          idempotencyKey: params.idempotencyKey,
          purpose: params.purpose || 'inference',
          inputTokens: meters.inputTokens,
          outputTokens: meters.outputTokens,
          cacheReadTokens: meters.cacheReadTokens,
          cacheWriteTokens: meters.cacheWriteTokens,
        },
      })
      return {
        status: 'settled' as const,
        debitId: debit.id,
        amountUsd: '0',
        subscriptionTakenUsd: '0',
        purchasedTakenUsd: '0',
        subscriptionCreditsUsd: org.subscriptionCreditsUsd,
        purchasedCreditsUsd: org.balanceUsd,
        totalUsableCredits: totalSpendable(
          org.subscriptionCreditsUsd,
          org.balanceUsd,
        ),
        meters,
      }
    }

    const total = totalSpendable(
      org.subscriptionCreditsUsd || '0',
      org.balanceUsd || '0',
    )
    if (moneyCmp(total, amountUsd) < 0) {
      return {
        status: 'insufficient' as const,
        reason: 'no_usable_credits' as const,
        totalUsableCredits: total,
        amountUsd,
      }
    }

    const subAvail = org.subscriptionCreditsUsd || '0'
    const fromSub =
      moneyCmp(subAvail, amountUsd) >= 0 ? amountUsd : subAvail
    const remainder =
      moneyCmp(amountUsd, fromSub) > 0
        ? moneySub(amountUsd, fromSub, 6)
        : '0'
    const newSub = moneySub(subAvail, fromSub, 6)
    const newPurchased = moneySub(org.balanceUsd || '0', remainder, 6)
    const newSpent = moneyAdd(org.spentThisPeriodUsd || '0', amountUsd, 6)
    const newMonthly = moneyAdd(org.monthlySpentUsd || '0', amountUsd, 6)

    const debit = await tx.billingDebit.create({
      data: {
        orgId: org.id,
        amountUsd,
        subscriptionTakenUsd: fromSub,
        purchasedTakenUsd: remainder,
        idempotencyKey: params.idempotencyKey,
        purpose: params.purpose || 'inference',
        inputTokens: meters.inputTokens,
        outputTokens: meters.outputTokens,
        cacheReadTokens: meters.cacheReadTokens,
        cacheWriteTokens: meters.cacheWriteTokens,
      },
    })

    const updated = await tx.org.update({
      where: { id: org.id },
      data: {
        subscriptionCreditsUsd: newSub,
        balanceUsd: newPurchased,
        spentThisPeriodUsd: newSpent,
        monthlySpentUsd: newMonthly,
      },
    })

    return {
      status: 'settled' as const,
      debitId: debit.id,
      amountUsd,
      subscriptionTakenUsd: fromSub,
      purchasedTakenUsd: remainder,
      subscriptionCreditsUsd: updated.subscriptionCreditsUsd,
      purchasedCreditsUsd: updated.balanceUsd,
      totalUsableCredits: totalSpendable(
        updated.subscriptionCreditsUsd,
        updated.balanceUsd,
      ),
      meters,
    }
  })
}
