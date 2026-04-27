// Helpers e tipos do Balanço Contábil. Antes viviam inline no
// relatorios/balanco/page.tsx (1255L). Movidos pra cá pra reduzir
// god-file e permitir reuso/teste.

import { MONTH_NAMES_PT } from "@/lib/time"

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

export interface SearchParams {
  periodo?: string
}

// "mensal:2026-04" | "anual:2026"
// snapshotDate é o MIN entre (último dia do período) e (hoje) — se
// estamos dentro do período em questão, tira retrato no dia de hoje;
// se o período já acabou, usa o fim dele; se o período é futuro, usa
// o fim dele também (projeção, edge case raro).
export function parsePeriod(p: string): {
  kind: "mensal" | "anual"
  year: number
  month?: number
  snapshotDate: string
  label: string
} {
  const now = new Date()
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  if (p.startsWith("anual:")) {
    const y = Number(p.slice(6))
    const endOfYear = `${y}-12-31`
    const snapshotDate = todayYmd < endOfYear ? todayYmd : endOfYear
    return {
      kind: "anual",
      year: y,
      snapshotDate,
      label: `Anual ${y}`,
    }
  }
  const ym = p.startsWith("mensal:") ? p.slice(7) : p
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const lastDay = new Date(y, m, 0).getDate()
  const endOfMonth = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  const snapshotDate = todayYmd < endOfMonth ? todayYmd : endOfMonth
  return {
    kind: "mensal",
    year: y,
    month: m,
    snapshotDate,
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
  }
}

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
