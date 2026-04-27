// Tipos compartilhados do Balanço Contábil. Extraídos do god-file
// app/relatorios/balanco/page.tsx pra permitir reuso entre helpers,
// queries e o entry-point Server Component.

import type { FipeMetadata } from "@/lib/fipe"

// === Linhas brutas vindas do Supabase ===

export type Tx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string | null
  is_transfer: boolean | null
}

export type AccountRow = {
  id: string
  name: string
  type: string
  opening_balance_cents: number | null
  balance_classification?: "circulante" | "nao_circulante" | null
}

export type AdjRow = {
  id: string
  period: string
  line_key: string
  label: string
  amount_cents: number
  note: string | null
  metadata?: FipeMetadata | null
}

export type RegistryRow = {
  id: string
  period: string
  kind: string
  description: string
  amount_cents: number
  debit_section: string
  debit_label: string
  credit_section: string
  credit_label: string
  note: string | null
  created_at: string
}

export interface SearchParams {
  periodo?: string
}

// === Estruturas internas do Balanço ===

export type Line = {
  accountId: string
  accountName: string
  cents: number
}

export type Bucket = {
  key: ClassificationKey
  label: string
  lines: Line[]
  total: number
}

export type OverdueLine = {
  id: string
  label: string
  dueDate: string
  cents: number
}

// === Classificação contábil ===

export const TYPE_CLASSIFICATION = {
  checking: "ativo_circulante_disponivel",
  cash: "ativo_circulante_disponivel",
  wallet: "ativo_circulante_disponivel",
  // Todas aplicações financeiras (renda fixa, renda variável, cripto)
  // entram em Ativo Circulante. Pra pessoa física no BR, essas são
  // líquidas o suficiente: poupança/CDB D+0, ações D+2, cripto 24/7.
  savings: "ativo_circulante_renda_fixa",
  poupanca: "ativo_circulante_renda_fixa",
  investment: "ativo_circulante_renda_variavel",
  crypto: "ativo_circulante_cripto",
  fgts: "ativo_nc_bloqueado",
  credit: "passivo_circulante_cartoes",
} as const

export type ClassificationKey =
  (typeof TYPE_CLASSIFICATION)[keyof typeof TYPE_CLASSIFICATION]

export const SECTION_LABELS: Record<ClassificationKey, string> = {
  ativo_circulante_disponivel: "Disponibilidades",
  ativo_circulante_renda_fixa: "Renda Fixa",
  ativo_circulante_renda_variavel: "Renda Variável",
  ativo_circulante_cripto: "Cripto",
  ativo_nc_bloqueado: "Bloqueado (FGTS)",
  passivo_circulante_cartoes: "Cartões de Crédito",
}
