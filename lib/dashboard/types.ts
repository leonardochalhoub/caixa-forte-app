// Tipos compartilhados pelo dashboard (`/app`). Centralizados aqui pra
// evitar repetição entre page.tsx, queries.ts e helpers.ts.

import type { AccountType } from "@/lib/types"

export type AccountRow = {
  id: string
  name: string
  type: string
  opening_balance_cents: number | null
  closing_day?: number | null
}

// Linha de transactions usada nas KPIs mensais (precisa de occurred_on,
// merchant e account_id pra inflar lump-sums com itemizados do cartão).
export type MonthTxRow = {
  account_id: string
  paid_at: string | null
  occurred_on: string
  type: string
  amount_cents: number | string
  category_id: string | null
  is_transfer: boolean | null
  merchant: string | null
}

// Subset de transactions usado pra detectar dívida agendada de cartão
// (lump-sum em conta corrente tipo "Nubank Cartão Abril 2026").
export type ExpenseTxRow = {
  account_id: string
  amount_cents: number
  merchant: string | null
  paid_at: string | null
  is_transfer: boolean | null
  tx_kind: string | null
}

// Linha rica usada pra calcular openCents real por fatura (mesma
// lógica do /app/cartoes — respeita closing_day, parseia mês/ano do
// merchant e separa charges, lump-sums e invoice_payments).
export type CardCalcTx = {
  account_id: string
  type: string
  amount_cents: number | string
  occurred_on: string
  merchant: string | null
  paid_at: string | null
  is_transfer: boolean | null
  tx_kind: string | null
}

export type FlowTxRow = {
  account_id: string
  type: string
  amount_cents: number | string
  paid_at: string | null
  is_transfer: boolean | null
  tx_kind: string | null
}

export type RecentTxRow = {
  id: string
  type: string
  amount_cents: number
  occurred_on: string
  merchant: string | null
  note: string | null
  needs_review: boolean | null
  account_id: string
  category_id: string | null
  created_at: string
  paid_at: string | null
}

export type UpcomingTxRow = {
  id: string
  type: string
  amount_cents: number | string
  occurred_on: string
  merchant: string | null
  note: string | null
  account_id: string
  category_id: string | null
}

export type CategoryRow = {
  id: string
  name: string
  is_income: boolean
  parent_id: string | null
  is_formal_income: boolean | null
}

export type PendingCaptureRow = {
  id: string
  channel: string
  raw_input: string
  groq_parse_json: unknown
  created_at: string
}

export type PendingVirtualTx = {
  amount_cents: number
  type: "income" | "expense"
  occurred_on: string
}

export type AccountWithBalance = {
  id: string
  name: string
  type: AccountType
  balanceCents: number
}

export type DashboardData = {
  monthTx: MonthTxRow[]
  recentTx: RecentTxRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  flowRealized: FlowTxRow[]
  upcomingTx: UpcomingTxRow[]
  pendingCaptures: PendingCaptureRow[]
  allExpenseTx: ExpenseTxRow[]
  cardCalcTxs: CardCalcTx[]
}
