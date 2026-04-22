import type { MonthlyTotals } from "./periods"

export interface PeriodTotals {
  incomeCents: number
  expenseCents: number
  netCents: number
  count: number          // number of months considered
  avgMonthlyNet: number  // cents
  avgMonthlyExpense: number
  avgMonthlyIncome: number
}

export function aggregatePeriod(rows: MonthlyTotals[]): PeriodTotals {
  const count = rows.length
  if (count === 0) {
    return {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      count: 0,
      avgMonthlyNet: 0,
      avgMonthlyExpense: 0,
      avgMonthlyIncome: 0,
    }
  }
  const incomeCents = rows.reduce((s, r) => s + r.incomeCents, 0)
  const expenseCents = rows.reduce((s, r) => s + r.expenseCents, 0)
  const netCents = incomeCents - expenseCents
  return {
    incomeCents,
    expenseCents,
    netCents,
    count,
    avgMonthlyNet: Math.round(netCents / count),
    avgMonthlyExpense: Math.round(expenseCents / count),
    avgMonthlyIncome: Math.round(incomeCents / count),
  }
}

/**
 * Simple projection: extrapolate monthly average over the next N months.
 * Inputs should be the historical MonthlyTotals ending at last closed month.
 */
export function project(
  history: MonthlyTotals[],
  monthsAhead: number,
): {
  incomeCents: number
  expenseCents: number
  netCents: number
  basis: "history_avg"
  monthsUsed: number
} {
  const usable = history.filter((h) => h.incomeCents > 0 || h.expenseCents > 0)
  if (usable.length === 0) {
    return {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      basis: "history_avg",
      monthsUsed: 0,
    }
  }
  const { avgMonthlyIncome, avgMonthlyExpense } = aggregatePeriod(usable)
  return {
    incomeCents: avgMonthlyIncome * monthsAhead,
    expenseCents: avgMonthlyExpense * monthsAhead,
    netCents: (avgMonthlyIncome - avgMonthlyExpense) * monthsAhead,
    basis: "history_avg",
    monthsUsed: usable.length,
  }
}
