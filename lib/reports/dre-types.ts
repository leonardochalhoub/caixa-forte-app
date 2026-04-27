// Tipos compartilhados do Relatório DRE (Demonstração de Resultados).
// Antes viviam inline no app/app/relatorios/dre/page.tsx (god-file 609L).

export type Tx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string | null
  is_transfer: boolean | null
  category_id: string | null
}

export type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
  is_formal_income: boolean | null
}

export type AccountRow = {
  id: string
  name: string
  type: string
}

export interface SearchParams {
  periodo?: string
}

// Período parseado a partir de "mensal:YYYY-MM" ou "anual:YYYY".
// `end` é exclusivo (gte/lt na query).
export type DREPeriod = {
  kind: "mensal" | "anual"
  label: string
  start: string
  end: string
}

// Filho de uma categoria — uma sub-categoria com seu total.
export type CategoryChild = {
  id: string
  name: string
  cents: number
  count: number
}

// Grupo de receitas por categoria pai. Inclui flag isFormal pra
// segregar receita operacional (trabalho) vs. capital.
export type IncomeGroup = {
  parentId: string
  parentName: string
  isFormal: boolean
  totalCents: number
  count: number
  children: Map<string, CategoryChild>
}

// Grupo de despesas por categoria pai.
export type ExpenseGroup = {
  parentId: string
  parentName: string
  totalCents: number
  count: number
  children: Map<string, CategoryChild>
}
