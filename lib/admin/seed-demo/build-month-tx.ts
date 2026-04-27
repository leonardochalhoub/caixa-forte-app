import { addDiscretionaryTxs } from "./recurring-discretionary"
import { addPayrollTxs } from "./recurring-payroll"
import type { Account, Category, TxPayload } from "./types"
import { daysInMonth, isoDate, isoTs } from "./utils"

// Contexto compartilhado entre os sub-módulos que populam um mês de
// transações. Centraliza RNG, helpers e o callback `add` que appenda
// uma tx no array do mês. Mantém a ordem exata de chamadas a `r()`,
// preservando determinismo do seed.
export type MonthCtx = {
  y: number
  m: number
  txs: TxPayload[]
  r: () => number
  pick: <T>(arr: T[]) => T
  between: (min: number, max: number) => number
  isFuture: (d: number) => boolean
  isCurrentMonth: boolean
  add: (
    accountName: string,
    catName: string | null,
    type: "income" | "expense",
    amountCents: number,
    day: number,
    merchant: string,
    isTransfer?: boolean,
  ) => void
}

// Builder do contexto: encapsula closures que dependem de userId/accs/cats/today
// e expõe a API uniforme pros sub-módulos.
function makeMonthCtx(
  userId: string,
  y: number,
  m: number,
  accs: Record<string, Account>,
  cats: Record<string, Category>,
  today: Date,
  r: () => number,
): MonthCtx {
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!
  const between = (min: number, max: number) =>
    Math.round(min + r() * (max - min))
  const isFuture = (d: number) => new Date(y, m - 1, d) > today
  const isCurrentMonth =
    y === today.getFullYear() && m === today.getMonth() + 1
  const paidChance = isFuture(1) ? 0 : isCurrentMonth ? 0.7 : 0.95

  const txs: TxPayload[] = []
  const add: MonthCtx["add"] = (
    accountName,
    catName,
    type,
    amountCents,
    day,
    merchant,
    isTransfer = false,
  ) => {
    const safeDay = Math.min(Math.max(1, day), daysInMonth(y, m))
    const dateStr = isoDate(y, m, safeDay)
    const future = isFuture(safeDay)
    const paid = !future && r() < paidChance
    const acc = accs[accountName]
    if (!acc) return
    const cat = catName ? cats[catName] : null
    txs.push({
      user_id: userId,
      account_id: acc.id,
      category_id: cat?.id ?? null,
      type,
      amount_cents: amountCents,
      occurred_on: dateStr,
      paid_at: paid ? isoTs(y, m, safeDay, between(8, 20)) : null,
      merchant,
      is_transfer: isTransfer,
      source: "web",
    })
  }

  return { y, m, txs, r, pick, between, isFuture, isCurrentMonth, add }
}

// Orquestrador de um mês: monta o contexto e delega às fases (payroll →
// despesas discricionárias). Retorna a lista de tx geradas. A ordem das
// fases e a sequência de `r()` dentro delas é load-bearing — não mexer
// sem repensar a determinismo do seed.
export function buildMonthTxs(
  userId: string,
  ym: string,
  accs: Record<string, Account>,
  cats: Record<string, Category>,
  today: Date,
  r: () => number,
): TxPayload[] {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const ctx = makeMonthCtx(userId, y, m, accs, cats, today, r)

  // Fase 1: receitas recorrentes (salário, sazonais, rendimentos, aportes).
  addPayrollTxs(ctx)

  // Fase 2: despesas (moradia, mercado, transporte, fatura, eventos, lazer).
  addDiscretionaryTxs(ctx)

  return ctx.txs
}
