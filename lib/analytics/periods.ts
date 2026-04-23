import { addMonths, format, startOfMonth, subMonths } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { APP_TIMEZONE } from "@/lib/time"

export interface MonthSlot {
  key: string         // yyyy-MM
  label: string       // abr., jan., ...
  start: string       // yyyy-MM-dd
  end: string         // yyyy-MM-dd (inclusive)
}

export interface MonthlyTotals {
  key: string
  label: string
  incomeCents: number
  expenseCents: number
  netCents: number
}

const MONTH_LABEL_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

export function lastNMonthSlots(n: number, now?: Date): MonthSlot[] {
  const base = toZonedTime(now ?? new Date(), APP_TIMEZONE)
  const slots: MonthSlot[] = []
  for (let i = n - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(base, i))
    const nextStart = addMonths(monthStart, 1)
    const monthEnd = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000)
    slots.push({
      key: format(monthStart, "yyyy-MM"),
      label: MONTH_LABEL_PT[monthStart.getMonth()] ?? "",
      start: format(monthStart, "yyyy-MM-dd"),
      end: format(monthEnd, "yyyy-MM-dd"),
    })
  }
  return slots
}

export interface BucketableTx {
  occurred_on: string
  type: "income" | "expense"
  amount_cents: number
  category_id: string | null
  is_transfer: boolean
}

/**
 * Bucketize por mês. Regras:
 * - Transferências (is_transfer=true) nunca contam nas KPIs.
 * - Incomes só contam se category_id estiver em formalIncomeCategoryIds
 *   (renda do trabalho). Rendimentos de capital (ações, dividendos)
 *   ficam fora do "Saldo operacional do mês" — são resultado não
 *   operacional, mostrados separadamente no DRE.
 * - Expenses não-transfer todos contam.
 */
export function bucketizeTransactions(
  transactions: BucketableTx[],
  slots: MonthSlot[],
  formalIncomeCategoryIds: Set<string>,
): MonthlyTotals[] {
  const empty = new Map<string, MonthlyTotals>()
  for (const s of slots) {
    empty.set(s.key, {
      key: s.key,
      label: s.label,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
  }
  for (const tx of transactions) {
    if (tx.is_transfer) continue
    const monthKey = tx.occurred_on.slice(0, 7)
    const bucket = empty.get(monthKey)
    if (!bucket) continue
    if (tx.type === "income") {
      if (tx.category_id && formalIncomeCategoryIds.has(tx.category_id)) {
        bucket.incomeCents += Number(tx.amount_cents)
      }
    } else {
      bucket.expenseCents += Number(tx.amount_cents)
    }
    bucket.netCents = bucket.incomeCents - bucket.expenseCents
  }
  return slots.map((s) => empty.get(s.key)!)
}
