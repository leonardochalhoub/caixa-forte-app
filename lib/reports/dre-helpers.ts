// Helpers puros do Relatório DRE. Tudo aqui é determinístico e testável
// sem rede/Supabase. Antes vivia inline no page.tsx (god-file 609L).

import { MONTH_NAMES_PT } from "@/lib/time"
import type {
  AccountRow,
  CategoryRow,
  DREPeriod,
  ExpenseGroup,
  IncomeGroup,
  Tx,
} from "./dre-types"

// ──────────────────────────────────────────────────────────────────────
// Período
// ──────────────────────────────────────────────────────────────────────

export function parsePeriod(p: string): DREPeriod {
  if (p.startsWith("anual:")) {
    const y = Number(p.slice(6))
    return {
      kind: "anual",
      label: `Ano ${y}`,
      start: `${y}-01-01`,
      end: `${y + 1}-01-01`,
    }
  }
  const ym = p.startsWith("mensal:") ? p.slice(7) : p
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const start = `${y}-${String(m).padStart(2, "0")}-01`
  const endMonth = m === 12 ? 1 : m + 1
  const endYear = m === 12 ? y + 1 : y
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`
  return {
    kind: "mensal",
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
    start,
    end,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Filtros base — exclui transferências, saldo-inicial e tx em cartão
// ──────────────────────────────────────────────────────────────────────

// Saldo inicial não é receita nem despesa — só ponto de partida da conta.
export function isOpeningBalance(m: string | null): boolean {
  if (!m) return false
  const n = m
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  return n.includes("saldo inicial") || n.includes("saldo-inicial")
}

// Charges no cartão não são "saída" real até a fatura ser paga.
// Mesma regra do hero/Home pra DRE bater com o KPI de "Saída do mês".
export function getCreditAccountIds(accs: AccountRow[]): Set<string> {
  return new Set(accs.filter((a) => a.type === "credit").map((a) => a.id))
}

export function filterDREEffectiveTxs(
  rawTxs: Tx[],
  creditAccountIds: Set<string>,
): Tx[] {
  return rawTxs
    .filter((t) => !t.is_transfer)
    .filter((t) => !isOpeningBalance(t.merchant))
    .filter((t) => !creditAccountIds.has(t.account_id))
}

// ──────────────────────────────────────────────────────────────────────
// Agregações por categoria
// ──────────────────────────────────────────────────────────────────────

export function getFormalIncomeIds(cats: CategoryRow[]): Set<string> {
  return new Set(cats.filter((c) => c.is_formal_income === true).map((c) => c.id))
}

export function buildIncomeGroups(
  incomes: Tx[],
  catById: Map<string, CategoryRow>,
  formalIncomeIds: Set<string>,
): Map<string, IncomeGroup> {
  const receitas = new Map<string, IncomeGroup>()
  for (const t of incomes) {
    const cat = t.category_id ? catById.get(t.category_id) : null
    const parentId = cat?.parent_id ?? (cat ? cat.id : "__none__")
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : cat
    const isFormal = Boolean(
      cat?.is_formal_income === true ||
        (parent && formalIncomeIds.has(parent.id)),
    )
    let g = receitas.get(parentId)
    if (!g) {
      g = {
        parentId,
        parentName: parent?.name ?? cat?.name ?? "Sem categoria",
        isFormal,
        totalCents: 0,
        count: 0,
        children: new Map(),
      }
      receitas.set(parentId, g)
    }
    const cents = Number(t.amount_cents)
    g.totalCents += cents
    g.count++
    if (cat?.parent_id) {
      const child = g.children.get(cat.id) ?? {
        id: cat.id,
        name: cat.name,
        cents: 0,
        count: 0,
      }
      child.cents += cents
      child.count++
      g.children.set(cat.id, child)
    }
  }
  return receitas
}

export function buildExpenseGroups(
  expenses: Tx[],
  catById: Map<string, CategoryRow>,
): Map<string, ExpenseGroup> {
  const despesas = new Map<string, ExpenseGroup>()
  for (const t of expenses) {
    const cat = t.category_id ? catById.get(t.category_id) : null
    const parentId = cat?.parent_id ?? (cat ? cat.id : "__none__")
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : cat
    let g = despesas.get(parentId)
    if (!g) {
      g = {
        parentId,
        parentName: parent?.name ?? cat?.name ?? "Sem categoria",
        totalCents: 0,
        count: 0,
        children: new Map(),
      }
      despesas.set(parentId, g)
    }
    const cents = Number(t.amount_cents)
    g.totalCents += cents
    g.count++
    if (cat?.parent_id) {
      const child = g.children.get(cat.id) ?? {
        id: cat.id,
        name: cat.name,
        cents: 0,
        count: 0,
      }
      child.cents += cents
      child.count++
      g.children.set(cat.id, child)
    }
  }
  return despesas
}

// ──────────────────────────────────────────────────────────────────────
// Totais
// ──────────────────────────────────────────────────────────────────────

export type DRETotals = {
  receitaTrabalho: number
  receitaCapital: number
  receitaTotal: number
  despesaTotal: number
  resultado: number
  margem: number
  resultadoLiquido: number
}

// Headline "Receita total" = só receita operacional (trabalho), mesma
// regra do hero/Home: capital (dividendos, cashback) é não-operacional
// e entra separado pra não poluir a margem operacional.
export function computeTotals(
  receitasArr: IncomeGroup[],
  despesasArr: ExpenseGroup[],
): DRETotals {
  const receitaTrabalho = receitasArr
    .filter((r) => r.isFormal)
    .reduce((s, r) => s + r.totalCents, 0)
  const receitaCapital = receitasArr
    .filter((r) => !r.isFormal)
    .reduce((s, r) => s + r.totalCents, 0)
  const receitaTotal = receitaTrabalho
  const despesaTotal = despesasArr.reduce((s, d) => s + d.totalCents, 0)
  const resultado = receitaTotal - despesaTotal
  const margem = receitaTotal > 0 ? (resultado / receitaTotal) * 100 : 0
  const resultadoLiquido = resultado + receitaCapital
  return {
    receitaTrabalho,
    receitaCapital,
    receitaTotal,
    despesaTotal,
    resultado,
    margem,
    resultadoLiquido,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Períodos disponíveis no dropdown
// ──────────────────────────────────────────────────────────────────────

export function buildAvailablePeriods(
  allOccurredOn: string[],
  now: Date,
): {
  periodOptions: { value: string; label: string }[]
  yearOptions: { value: string; label: string }[]
} {
  const activeMonths = new Set<string>()
  const activeYears = new Set<number>()
  for (const occurred_on of allOccurredOn) {
    activeMonths.add(occurred_on.slice(0, 7))
    activeYears.add(Number(occurred_on.slice(0, 4)))
  }
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  activeMonths.add(currentYm)
  activeYears.add(now.getFullYear())

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

// ──────────────────────────────────────────────────────────────────────
// Display name (mesma regra das outras pages)
// ──────────────────────────────────────────────────────────────────────

export function resolveDisplayName(
  profileRaw: { display_name?: string | null } | null,
  userMeta: { display_name?: string; full_name?: string } | null | undefined,
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

// ──────────────────────────────────────────────────────────────────────
// XLSX rows
// ──────────────────────────────────────────────────────────────────────

export function buildDREXlsxRows(params: {
  period: DREPeriod
  receitasArr: IncomeGroup[]
  despesasArr: ExpenseGroup[]
  totals: DRETotals
}): (string | number)[][] {
  const { period, receitasArr, despesasArr, totals } = params
  const { receitaTrabalho, receitaCapital, receitaTotal, despesaTotal, resultado, margem } =
    totals

  return [
    ["DRE · " + period.label],
    [],
    ["RECEITAS"],
    ["  Rendimentos do Trabalho", receitaTrabalho / 100],
    ...receitasArr
      .filter((r) => r.isFormal)
      .flatMap((r) => [
        [`    ${r.parentName}`, r.totalCents / 100, r.count],
        ...[...r.children.values()].map((c) => [
          `      ${c.name}`,
          c.cents / 100,
          c.count,
        ]),
      ]),
    ["  Rendimentos de Capital e Outros", receitaCapital / 100],
    ...receitasArr
      .filter((r) => !r.isFormal)
      .flatMap((r) => [
        [`    ${r.parentName}`, r.totalCents / 100, r.count],
        ...[...r.children.values()].map((c) => [
          `      ${c.name}`,
          c.cents / 100,
          c.count,
        ]),
      ]),
    ["TOTAL RECEITAS", receitaTotal / 100],
    [],
    ["DESPESAS"],
    ...despesasArr.flatMap((d) => [
      [`  ${d.parentName}`, d.totalCents / 100, d.count],
      ...[...d.children.values()]
        .sort((a, b) => b.cents - a.cents)
        .map((c) => [`    ${c.name}`, c.cents / 100, c.count]),
    ]),
    ["TOTAL DESPESAS", despesaTotal / 100],
    [],
    ["RESULTADO DO PERÍODO", resultado / 100],
    ["Margem (%)", Number(margem.toFixed(2))],
  ]
}
