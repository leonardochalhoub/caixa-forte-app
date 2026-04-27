// Tipos compartilhados do Relatório de Conciliação. Antes viviam inline
// no app/app/relatorios/conciliacao/page.tsx (god-file de 948L).

export type Tx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  created_at: string
  merchant: string | null
  is_transfer: boolean | null
  category_id: string | null
}

export type AccountRow = {
  id: string
  name: string
  type: string
  opening_balance_cents: number | null
  created_at: string
}

export type PendingParsed = {
  id: string
  amount_cents: number
  type: "income" | "expense"
  occurred_on: string
  merchant: string | null
}

export interface SearchParams {
  periodo?: string
}

// Linha agregada por conta dentro do período. Calculada em
// `buildAccountRows` no helpers.
export type AccountRowSummary = {
  account: AccountRow
  opening: number
  startBalance: number
  incomeCents: number
  expenseCents: number
  transferInCents: number
  transferOutCents: number
  endBalance: number
  within: Tx[]
  before: Tx[]
}
