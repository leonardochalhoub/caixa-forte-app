// Helpers puros do Relatório de Conciliação. Tudo aqui é determinístico
// e testável sem rede/Supabase. Antes vivia inline no page.tsx (948L).

import { MONTH_NAMES_PT } from "@/lib/time"
import type {
  AccountRow,
  AccountRowSummary,
  PendingParsed,
  Tx,
} from "./conciliacao-types"

// ──────────────────────────────────────────────────────────────────────
// Filtros e classificações básicas
// ──────────────────────────────────────────────────────────────────────

// Regra: não-cartão só conta tx com paid_at setado (dinheiro que
// realmente mexeu no saldo). Cartão conta tudo, charges são dívida
// desde o swipe — saldo de cartão já inclui pending.
export function filterEffectiveTxs(
  rawTxs: Tx[],
  creditAccountIds: Set<string>,
): Tx[] {
  return rawTxs.filter(
    (t) => creditAccountIds.has(t.account_id) || t.paid_at != null,
  )
}

export function getCreditAccountIds(accs: AccountRow[]): Set<string> {
  return new Set(accs.filter((a) => a.type === "credit").map((a) => a.id))
}

export function filterTxsByKnownAccounts(
  allTxRaw: Tx[],
  accs: AccountRow[],
): Tx[] {
  return allTxRaw.filter((t) => accs.some((a) => a.id === t.account_id))
}

// ──────────────────────────────────────────────────────────────────────
// Detecção de lump-sum de fatura de cartão
// ──────────────────────────────────────────────────────────────────────

export function normalizeStr(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function bankKeyOf(cardName: string): string {
  const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
  return normalizeStr(cleaned.split(/\s+/)[0] ?? "")
}

// Detecta lump-sums de fatura de cartão em OUTRAS contas (merchant
// "<banco> cartão" agendado). Esses entram no detalhamento do
// cartão como "fatura a pagar" pra refletir a dívida real.
export function detectLumpSumsForCard(card: AccountRow, rawTxs: Tx[]): Tx[] {
  if (card.type !== "credit") return []
  const key = bankKeyOf(card.name)
  if (!key) return []
  return rawTxs.filter((t) => {
    if (t.account_id === card.id) return false
    if (t.is_transfer) return false
    if (t.type !== "expense") return false
    if (t.paid_at) return false // já pago
    const m = normalizeStr(t.merchant ?? "")
    return m.includes("cartao") && m.includes(key)
  })
}

// ──────────────────────────────────────────────────────────────────────
// Período
// ──────────────────────────────────────────────────────────────────────

export function makePeriodPredicates(
  isFullHistory: boolean,
  periodStart: string | null,
  periodEnd: string | null,
) {
  const inPeriod = (t: Tx) => {
    if (isFullHistory) return true
    return t.occurred_on >= periodStart! && t.occurred_on < periodEnd!
  }
  const beforePeriod = (t: Tx) => {
    if (isFullHistory) return false
    return t.occurred_on < periodStart!
  }
  return { inPeriod, beforePeriod }
}

// ──────────────────────────────────────────────────────────────────────
// Agregação por conta
// ──────────────────────────────────────────────────────────────────────

function sumDelta(txs: Tx[]): number {
  return txs.reduce(
    (s, t) => s + (t.type === "income" ? t.amount_cents : -t.amount_cents),
    0,
  )
}

export function buildAccountRows(params: {
  accs: AccountRow[]
  allTx: Tx[]
  rawTxs: Tx[]
  isFullHistory: boolean
  inPeriod: (t: Tx) => boolean
  beforePeriod: (t: Tx) => boolean
}): AccountRowSummary[] {
  const { accs, allTx, rawTxs, isFullHistory, inPeriod, beforePeriod } = params

  return accs.map((a) => {
    const own = allTx.filter((t) => t.account_id === a.id)
    const detectedLumpSums = detectLumpSumsForCard(a, rawTxs)
    // Cartão: lump-sum (valor base original da fatura) + itemizados
    // (compras novas que aumentam a dívida) são SOMADOS. Running
    // balance na lista reflete isso naturalmente.
    const mine = [...own, ...detectedLumpSums]
    const opening = Number(a.opening_balance_cents ?? 0)
    const before = mine.filter(beforePeriod)
    const within = mine.filter(inPeriod)

    const startBalance = isFullHistory ? opening : opening + sumDelta(before)
    const incomeCents = within
      .filter((t) => t.type === "income" && !t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const expenseCents = within
      .filter((t) => t.type === "expense" && !t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const transferInCents = within
      .filter((t) => t.type === "income" && t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const transferOutCents = within
      .filter((t) => t.type === "expense" && t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const endBalance =
      startBalance + incomeCents - expenseCents + transferInCents - transferOutCents

    return {
      account: a,
      opening,
      startBalance,
      incomeCents,
      expenseCents,
      transferInCents,
      transferOutCents,
      endBalance,
      within,
      before,
    }
  })
}

// Ordena contas pelo timestamp da última movimentação NO PERÍODO
// (descendente). Contas sem movimentação no período vão pro fim,
// ordenadas pelo nome. FGTS fica sempre por último.
export function latestActivityKey(r: AccountRowSummary): string {
  if (r.within.length === 0) return "0000-00-00T00:00:00Z"
  const last = r.within[r.within.length - 1]!
  return last.created_at || `${last.occurred_on}T00:00:00Z`
}

export function splitFgtsAndSort(rows: AccountRowSummary[]): {
  nonFgts: AccountRowSummary[]
  fgts: AccountRowSummary[]
  nonFgtsNonCredit: AccountRowSummary[]
} {
  const nonFgts = rows
    .filter((r) => r.account.type !== "fgts")
    .sort((a, b) => {
      const aHas = a.within.length > 0
      const bHas = b.within.length > 0
      if (aHas !== bHas) return aHas ? -1 : 1
      if (!aHas) return a.account.name.localeCompare(b.account.name)
      return latestActivityKey(b).localeCompare(latestActivityKey(a))
    })
  const fgts = rows.filter((r) => r.account.type === "fgts")
  // Para os totais (Saldo total agora), excluímos contas de cartão —
  // a dívida do cartão NÃO reduz o saldo das contas, só sai quando
  // a fatura é paga (via tx real na conta corrente). Mesma regra do
  // hero na home. Cartão aparece separadamente como informativo.
  const nonFgtsNonCredit = nonFgts.filter((r) => r.account.type !== "credit")
  return { nonFgts, fgts, nonFgtsNonCredit }
}

// ──────────────────────────────────────────────────────────────────────
// Totais e pendentes
// ──────────────────────────────────────────────────────────────────────

export type AccountsTotal = {
  startBalance: number
  incomeCents: number
  expenseCents: number
  transferInCents: number
  transferOutCents: number
  endBalance: number
}

export function sumAccountsTotal(rows: AccountRowSummary[]): AccountsTotal {
  const sum = (field: keyof AccountRowSummary) =>
    rows.reduce((s, r) => s + (r[field] as number), 0)
  return {
    startBalance: sum("startBalance"),
    incomeCents: sum("incomeCents"),
    expenseCents: sum("expenseCents"),
    transferInCents: sum("transferInCents"),
    transferOutCents: sum("transferOutCents"),
    endBalance: sum("endBalance"),
  }
}

export type PendingTotals = {
  pendingInPeriod: PendingParsed[]
  pendingIncomeCents: number
  pendingExpenseCents: number
  pendingNetCents: number
}

export function computePendingTotals(
  pendingCaptures: PendingParsed[],
  isFullHistory: boolean,
  periodStart: string | null,
  periodEnd: string | null,
): PendingTotals {
  const pendingInPeriod = pendingCaptures.filter((p) => {
    if (isFullHistory) return true
    return p.occurred_on >= periodStart! && p.occurred_on < periodEnd!
  })
  const pendingIncomeCents = pendingInPeriod
    .filter((p) => p.type === "income")
    .reduce((s, p) => s + p.amount_cents, 0)
  const pendingExpenseCents = pendingInPeriod
    .filter((p) => p.type === "expense")
    .reduce((s, p) => s + p.amount_cents, 0)
  return {
    pendingInPeriod,
    pendingIncomeCents,
    pendingExpenseCents,
    pendingNetCents: pendingIncomeCents - pendingExpenseCents,
  }
}

// Separa saídas "normais" das saídas de fatura de cartão
// (charges no cartão + lump-sum detectado) pra mostrar na prova
// matemática quanto veio do cartão vs. do resto.
export function computeExpenseSplit(rows: AccountRowSummary[]): {
  cardFatureCents: number
  nonCardExpenseCents: number
} {
  const cardFatureCents = rows
    .filter((r) => r.account.type === "credit")
    .reduce((s, r) => s + r.expenseCents, 0)
  const nonCardExpenseCents = rows
    .filter((r) => r.account.type !== "credit" && r.account.type !== "fgts")
    .reduce((s, r) => s + r.expenseCents, 0)
  return { cardFatureCents, nonCardExpenseCents }
}

// ──────────────────────────────────────────────────────────────────────
// Meses disponíveis no dropdown
// ──────────────────────────────────────────────────────────────────────

// Meses disponíveis no dropdown: só aqueles que tiveram atividade
// "real" — despesa, entrada formal ou pendente. Saldo inicial e
// transferências não aparecem sozinhos (mês sem movimento humano).
// Garante que o mês atual apareça sempre, mesmo que vazio.
export function buildAvailableMonths(
  allTx: Tx[],
  pendingCaptures: PendingParsed[],
  defaultYm: string,
): { value: string; label: string }[] {
  const monthsWithActivity = new Set<string>()
  for (const t of allTx) {
    if (t.is_transfer) continue
    monthsWithActivity.add(t.occurred_on.slice(0, 7))
  }
  for (const p of pendingCaptures) {
    monthsWithActivity.add(p.occurred_on.slice(0, 7))
  }
  monthsWithActivity.add(defaultYm)
  return [...monthsWithActivity]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return { value: ym, label: `${MONTH_NAMES_PT[m - 1]} ${y}` }
    })
}

// ──────────────────────────────────────────────────────────────────────
// XLSX rows
// ──────────────────────────────────────────────────────────────────────

// XLSX guarda números como números — Excel aplica formato monetário
// via "formato da célula" se o user quiser. Aqui entregamos reais (com
// 2 decimais) como Number, não strings.
const toReais = (cents: number) => Math.round(cents) / 100

export function buildXlsxRows(params: {
  nonFgts: AccountRowSummary[]
  fgts: AccountRowSummary[]
  pendingInPeriod: PendingParsed[]
  pendingIncomeCents: number
  pendingExpenseCents: number
  pendingNetCents: number
  accountsTotal: AccountsTotal
  totalIncomeCents: number
  totalExpenseCents: number
  projectedEndBalance: number
}): (string | number)[][] {
  const {
    nonFgts,
    fgts,
    pendingInPeriod,
    pendingIncomeCents,
    pendingExpenseCents,
    pendingNetCents,
    accountsTotal,
    totalIncomeCents,
    totalExpenseCents,
    projectedEndBalance,
  } = params

  const xlsxRows: (string | number)[][] = [
    [
      "Conta",
      "Tipo",
      "Saldo inicial",
      "Entradas",
      "Saídas",
      "Transf. entrada",
      "Transf. saída",
      "Saldo final",
    ],
    ...nonFgts.map((r) => [
      r.account.name,
      r.account.type,
      toReais(r.startBalance),
      toReais(r.incomeCents),
      toReais(r.expenseCents),
      toReais(r.transferInCents),
      toReais(r.transferOutCents),
      toReais(r.endBalance),
    ]),
    ...fgts.map((r) => [
      `${r.account.name} (não entra no saldo)`,
      r.account.type,
      toReais(r.startBalance),
      toReais(r.incomeCents),
      toReais(r.expenseCents),
      toReais(r.transferInCents),
      toReais(r.transferOutCents),
      toReais(r.endBalance),
    ]),
  ]
  if (pendingInPeriod.length > 0) {
    xlsxRows.push([
      "PENDENTES (sem conta atribuída)",
      "pending",
      0,
      toReais(pendingIncomeCents),
      toReais(pendingExpenseCents),
      0,
      0,
      toReais(pendingNetCents),
    ])
  }
  xlsxRows.push([
    "TOTAL (ex-FGTS, com pendentes)",
    "",
    toReais(accountsTotal.startBalance),
    toReais(totalIncomeCents),
    toReais(totalExpenseCents),
    toReais(accountsTotal.transferInCents),
    toReais(accountsTotal.transferOutCents),
    toReais(projectedEndBalance),
  ])
  xlsxRows.push([])
  xlsxRows.push(["Detalhamento por conta"])
  xlsxRows.push([
    "Conta",
    "Data",
    "Tipo",
    "Descrição",
    "Transferência?",
    "Valor",
    "Saldo corrente",
  ])
  for (const r of [...nonFgts, ...fgts]) {
    let running = r.startBalance
    xlsxRows.push([
      r.account.name,
      "—",
      "início",
      "Saldo inicial do período",
      "",
      "",
      toReais(running),
    ])
    for (const t of r.within) {
      const delta = t.type === "income" ? t.amount_cents : -t.amount_cents
      running += delta
      xlsxRows.push([
        r.account.name,
        t.occurred_on,
        t.type === "income" ? "entrada" : "saída",
        t.merchant ?? "(sem descrição)",
        t.is_transfer ? "sim" : "não",
        toReais(delta),
        toReais(running),
      ])
    }
    xlsxRows.push([
      r.account.name,
      "—",
      "fim",
      "Saldo final do período",
      "",
      "",
      toReais(r.endBalance),
    ])
  }
  return xlsxRows
}

// ──────────────────────────────────────────────────────────────────────
// Display name
// ──────────────────────────────────────────────────────────────────────

export function resolveDisplayName(
  profileRaw: { display_name: string | null } | null,
  userMeta:
    | { display_name?: string; full_name?: string }
    | null
    | undefined,
  email: string | null | undefined,
): string {
  return (
    profileRaw?.display_name ??
    userMeta?.display_name ??
    userMeta?.full_name ??
    email ??
    ""
  )
}
