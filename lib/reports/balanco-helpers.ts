// Helpers puros do Balanço Contábil. Funções aqui devem ser livres
// de IO (sem Supabase) — recebem dados e devolvem dados. Foram
// extraídas do god-file app/relatorios/balanco/page.tsx pra permitir
// composição e testes diretos.

import type { FipeMetadata } from "@/lib/fipe"
import type { Adjustment } from "@/app/app/relatorios/balanco/_components/AdjustmentForm"
import { bankKeyOfCard, normalizeMerchant } from "@/lib/invoices/bucket"
import { MONTH_NAMES_PT } from "@/lib/time"
import {
  type AccountRow,
  type AdjRow,
  type Bucket,
  type ClassificationKey,
  type OverdueLine,
  type Tx,
  SECTION_LABELS,
  TYPE_CLASSIFICATION,
} from "./balanco-types"

// === Período → prefixo YYYY-MM ou YYYY pra filtrar transações ===

export type PeriodInfo = {
  kind: "mensal" | "anual"
  year: number
  month?: number
  snapshotDate: string
}

export function periodPrefixOf(period: PeriodInfo): string {
  return period.kind === "mensal"
    ? `${period.year}-${String(period.month).padStart(2, "0")}`
    : `${period.year}`
}

// === Adjustments agrupados por seção ===

export type AdjustmentsBySection = Map<string, Adjustment[]>

export function groupAdjustmentsBySection(
  adjustments: AdjRow[],
): AdjustmentsBySection {
  const map: AdjustmentsBySection = new Map()
  for (const a of adjustments) {
    const [section] = a.line_key.split("::")
    if (!section) continue
    const list = map.get(section) ?? []
    const readonlySource =
      (a.metadata as FipeMetadata | null)?.source === "fipe"
        ? ("fipe" as const)
        : null
    list.push({
      id: a.id,
      label: a.label,
      amount_cents: a.amount_cents,
      note: a.note,
      readonly_source: readonlySource,
    })
    map.set(section, list)
  }
  return map
}

export function makeSumAdj(
  adjustmentsBySection: AdjustmentsBySection,
): (section: string) => number {
  return (section) =>
    (adjustmentsBySection.get(section) ?? []).reduce(
      (s, a) => s + a.amount_cents,
      0,
    )
}

// === Saldo de uma conta na data do snapshot ===

// Não-cartão: só paid_at !== null e paid_at <= snapshot (caixa real).
// Cartão: faturas do PERÍODO selecionado, ainda não pagas até o snapshot.
//   - Mensal Abril → só fatura(s) com occurred_on em 2026-04
//   - Anual 2026   → faturas com occurred_on em 2026-* ainda abertas em 31/12
// Mesma lógica do /app/cartoes (agrupamento por YYYY-MM).
export function balanceAt(
  acc: AccountRow,
  cutoffIso: string,
  txs: Tx[],
  periodPrefix: string,
): number {
  const inPeriod = (ymd: string): boolean => ymd.startsWith(periodPrefix)
  const isPaidBySnapshot = (t: { paid_at: string | null }): boolean =>
    !!t.paid_at && t.paid_at <= `${cutoffIso}T23:59:59Z`

  const opening = Number(acc.opening_balance_cents ?? 0)
  const isCredit = acc.type === "credit"
  const mine = txs.filter((t) => t.account_id === acc.id)
  let flow = 0

  if (!isCredit) {
    for (const t of mine) {
      if (t.occurred_on > cutoffIso) continue
      if (!t.paid_at) continue
      if (t.paid_at > `${cutoffIso}T23:59:59Z`) continue
      flow +=
        t.type === "income"
          ? Number(t.amount_cents)
          : -Number(t.amount_cents)
    }
    return opening + flow
  }

  // Cartão: soma só faturas do período selecionado ainda abertas no snapshot
  for (const t of mine) {
    if (!inPeriod(t.occurred_on)) continue
    if (isPaidBySnapshot(t)) continue
    flow +=
      t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
  }
  const bankKey = bankKeyOfCard(acc.name)
  if (bankKey) {
    for (const t of txs) {
      if (t.account_id === acc.id) continue
      if (t.is_transfer) continue
      if (t.type !== "expense") continue
      if (!inPeriod(t.occurred_on)) continue
      if (isPaidBySnapshot(t)) continue
      const m = normalizeMerchant(t.merchant ?? "")
      if (!m.includes("cartao")) continue
      if (!m.includes(bankKey)) continue
      flow -= Number(t.amount_cents)
    }
  }
  return flow
}

// === Buckets por classificação contábil ===

// Override do user: se marcou nao_circulante e default é Ativo
// Circulante, move pro bucket "bloqueado" (mais próximo de "NC
// genérico"). Se marcou circulante mas default é NC (ex: FGTS),
// move pra Disponibilidades.
function resolveBucketKey(acc: AccountRow): ClassificationKey | null {
  const defaultKey =
    TYPE_CLASSIFICATION[acc.type as keyof typeof TYPE_CLASSIFICATION]
  if (!defaultKey) return null
  if (acc.balance_classification === "nao_circulante") {
    if (defaultKey.startsWith("ativo_circulante")) return "ativo_nc_bloqueado"
  } else if (acc.balance_classification === "circulante") {
    if (defaultKey === "ativo_nc_bloqueado") return "ativo_circulante_disponivel"
  }
  return defaultKey
}

export function buildBuckets(
  accounts: AccountRow[],
  txs: Tx[],
  snapshotDate: string,
  periodPrefix: string,
): Map<ClassificationKey, Bucket> {
  const buckets = new Map<ClassificationKey, Bucket>()
  for (const a of accounts) {
    const key = resolveBucketKey(a)
    if (!key) continue
    const cents = balanceAt(a, snapshotDate, txs, periodPrefix)
    const b = buckets.get(key) ?? {
      key,
      label: SECTION_LABELS[key],
      lines: [],
      total: 0,
    }
    const value = key.startsWith("passivo") ? Math.abs(cents) : cents
    b.lines.push({
      accountId: a.id,
      accountName: a.name,
      cents: value,
    })
    b.total += value
    buckets.set(key, b)
  }
  return buckets
}

// === Agendadas vencidas (Passivo Circulante extra) ===

// Despesas non-cartão, não pagas, com occurred_on já passado entram
// como Passivo Circulante — são dívidas de curto prazo, obrigações
// assumidas cujo serviço/bem já foi prestado. Cartão tem bucket próprio.
export function computeOverdueLiabilities(
  txs: Tx[],
  accounts: AccountRow[],
  snapshotDate: string,
): OverdueLine[] {
  const creditIds = new Set(
    accounts.filter((a) => a.type === "credit").map((a) => a.id),
  )
  const overdue: OverdueLine[] = []
  for (const t of txs) {
    if (t.is_transfer) continue
    if (t.type !== "expense") continue
    if (t.paid_at) continue
    if (t.occurred_on > snapshotDate) continue
    if (creditIds.has(t.account_id)) continue
    const m = normalizeMerchant(t.merchant ?? "")
    if (m.includes("cartao")) continue
    overdue.push({
      id: t.id,
      label: t.merchant ?? "Despesa vencida",
      dueDate: t.occurred_on,
      cents: Number(t.amount_cents),
    })
  }
  return overdue
}

// === Totais consolidados do Balanço ===

export type BalancoTotals = {
  ativoCirculanteDisponivelTotal: number
  ativoCirculanteRendaFixaTotal: number
  ativoCirculanteRendaVarTotal: number
  ativoCirculanteCriptoTotal: number
  ativoCirculanteTotal: number
  ativoNCBloqueadoTotal: number
  ativoNCImobilizadoTotal: number
  ativoNCIntangivelTotal: number
  ativoNCTotal: number
  ativoTotal: number
  overdueLiabilitiesTotal: number
  passivoCirculanteTotal: number
  passivoNCTotal: number
  passivoTotal: number
  patrimonioLiquido: number
  balanced: boolean
}

export function computeBalancoTotals(
  buckets: Map<ClassificationKey, Bucket>,
  sumAdj: (section: string) => number,
  overdueLiabilities: OverdueLine[],
): BalancoTotals {
  const ativoCirculanteDisponivel = buckets.get("ativo_circulante_disponivel")
  const ativoCirculanteRendaFixa = buckets.get("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVar = buckets.get("ativo_circulante_renda_variavel")
  const ativoCirculanteCripto = buckets.get("ativo_circulante_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  const ativoCirculanteDisponivelTotal =
    (ativoCirculanteDisponivel?.total ?? 0) +
    sumAdj("ativo_circulante_disponivel") +
    sumAdj("ativo_circulante_outros")
  const ativoCirculanteRendaFixaTotal =
    (ativoCirculanteRendaFixa?.total ?? 0) +
    sumAdj("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVarTotal =
    (ativoCirculanteRendaVar?.total ?? 0) +
    sumAdj("ativo_circulante_renda_variavel")
  const ativoCirculanteCriptoTotal =
    (ativoCirculanteCripto?.total ?? 0) +
    sumAdj("ativo_circulante_cripto")
  const ativoCirculanteTotal =
    ativoCirculanteDisponivelTotal +
    ativoCirculanteRendaFixaTotal +
    ativoCirculanteRendaVarTotal +
    ativoCirculanteCriptoTotal

  const ativoNCBloqueadoTotal =
    (ativoNCBloqueado?.total ?? 0) + sumAdj("ativo_nc_bloqueado")
  const ativoNCImobilizadoTotal = sumAdj("ativo_nc_imobilizado")
  const ativoNCIntangivelTotal = sumAdj("ativo_nc_intangivel")
  const ativoNCTotal =
    ativoNCBloqueadoTotal + ativoNCImobilizadoTotal + ativoNCIntangivelTotal
  const ativoTotal = ativoCirculanteTotal + ativoNCTotal

  const overdueLiabilitiesTotal = overdueLiabilities.reduce(
    (s, l) => s + l.cents,
    0,
  )
  const passivoCirculanteTotal =
    (passivoCartoes?.total ?? 0) +
    sumAdj("passivo_circulante_cartoes") +
    sumAdj("passivo_circulante_outros") +
    overdueLiabilitiesTotal
  const passivoNCTotal = sumAdj("passivo_nc_financiamentos")
  const passivoTotal = passivoCirculanteTotal + passivoNCTotal

  // Patrimônio líquido = Ativo - Passivo (equação fundamental do BP)
  const patrimonioLiquido = ativoTotal - passivoTotal
  const balanced = ativoTotal === passivoTotal + patrimonioLiquido

  return {
    ativoCirculanteDisponivelTotal,
    ativoCirculanteRendaFixaTotal,
    ativoCirculanteRendaVarTotal,
    ativoCirculanteCriptoTotal,
    ativoCirculanteTotal,
    ativoNCBloqueadoTotal,
    ativoNCImobilizadoTotal,
    ativoNCIntangivelTotal,
    ativoNCTotal,
    ativoTotal,
    overdueLiabilitiesTotal,
    passivoCirculanteTotal,
    passivoNCTotal,
    passivoTotal,
    patrimonioLiquido,
    balanced,
  }
}

// === Períodos disponíveis pro seletor ===

// Meses/anos com tx REAL (não transfer, senão "Saldo inicial" inflava
// meses vazios) + ajustes + mês atual.
export function buildPeriodOptions(
  txs: Tx[],
  adjustments: AdjRow[],
): {
  periodOptions: { value: string; label: string }[]
  yearOptions: { value: string; label: string }[]
} {
  const activeMonths = new Set<string>()
  const activeYears = new Set<number>()
  for (const t of txs) {
    if (t.is_transfer) continue
    activeMonths.add(t.occurred_on.slice(0, 7))
    activeYears.add(Number(t.occurred_on.slice(0, 4)))
  }
  for (const a of adjustments) {
    if (a.period.startsWith("mensal:")) {
      const ym = a.period.slice(7)
      activeMonths.add(ym)
      activeYears.add(Number(ym.slice(0, 4)))
    } else if (a.period.startsWith("anual:")) {
      activeYears.add(Number(a.period.slice(6)))
    }
  }
  const today = new Date()
  const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  activeMonths.add(currentYm)
  activeYears.add(today.getFullYear())

  const periodOptions = [...activeMonths]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return {
        value: `mensal:${ym}`,
        label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
      }
    })
  const yearOptions = [...activeYears]
    .sort((a, b) => b - a)
    .map((y) => ({ value: `anual:${y}`, label: `Ano ${y}` }))

  return { periodOptions, yearOptions }
}
