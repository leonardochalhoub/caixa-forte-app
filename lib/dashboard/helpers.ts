// Agregações puras do dashboard (`/app`). Sem I/O — recebem dados já
// carregados por queries.ts e devolvem números/maps prontos pro JSX.
// Toda função aqui é determinística e testável isoladamente.

import type { AccountType } from "@/lib/types"
import {
  bankKeyOfCard,
  chargeInvoiceMonth,
  merchantInvoiceMonth,
  normalizeMerchant,
} from "@/lib/invoices/bucket"
import {
  bucketizeTransactions,
  type MonthSlot,
  type MonthlyTotals,
} from "@/lib/analytics/periods"
import type {
  AccountRow,
  AccountWithBalance,
  CardCalcTx,
  CategoryRow,
  ExpenseTxRow,
  FlowTxRow,
  MonthTxRow,
  PendingCaptureRow,
  PendingVirtualTx,
} from "./types"

/** IDs das contas do tipo crédito. Usado em vários filtros. */
export function getCreditAccountIds(accounts: AccountRow[]): Set<string> {
  return new Set(accounts.filter((a) => a.type === "credit").map((a) => a.id))
}

/** IDs das categorias marcadas como renda formal (do trabalho). */
export function getFormalIncomeIds(categories: CategoryRow[]): Set<string> {
  return new Set(
    categories.filter((c) => c.is_formal_income === true).map((c) => c.id),
  )
}

/**
 * Pending captures (no_account) são gastos reais ainda não alocados.
 * Sintetizamos como tx virtuais pra que KPIs mensais e o hero total
 * já reflitam o número — quando o user atribui uma conta, só move o
 * valor de "pendente" pra "real", sem double-count.
 */
export function buildPendingVirtualTx(
  pendingCaptures: PendingCaptureRow[],
): PendingVirtualTx[] {
  return pendingCaptures
    .map(
      (c) =>
        c.groq_parse_json as {
          amount_cents?: number
          type?: "income" | "expense"
          occurred_on?: string
        } | null,
    )
    .filter(
      (p): p is PendingVirtualTx =>
        !!p &&
        typeof p.amount_cents === "number" &&
        (p.type === "income" || p.type === "expense") &&
        typeof p.occurred_on === "string",
    )
}

export function pendingNetCentsOf(pending: PendingVirtualTx[]): number {
  return pending.reduce(
    (s, p) => s + (p.type === "income" ? p.amount_cents : -p.amount_cents),
    0,
  )
}

/**
 * Map `${cardId}-${yyyy-mm}` → soma dos charges itemized do mês.
 * Usado pra inflar lump-sums agendados em conta corrente
 * ("Nubank Cartão Abril 2026") com o que já foi gasto no cartão.
 */
export function buildItemizedByCardMonth(
  monthTx: MonthTxRow[],
  creditAccountIds: Set<string>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of monthTx) {
    if (t.is_transfer) continue
    if (!creditAccountIds.has(t.account_id)) continue
    if (t.type !== "expense") continue
    const key = `${t.account_id}-${t.occurred_on.slice(0, 7)}`
    map.set(key, (map.get(key) ?? 0) + Number(t.amount_cents))
  }
  return map
}

/** Map bankKey ("nubank") → cardId. Usado nos lookups de lump-sum. */
export function buildCardsByBankKey(accounts: AccountRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const a of accounts) {
    if (a.type !== "credit") continue
    const k = bankKeyOfCard(a.name)
    if (k) map.set(k, a.id)
  }
  return map
}

/**
 * Aplica a regra de "inflar lump-sum agendado de cartão" nas KPIs
 * mensais. Pagamento via botão Pagar (`pagamento fatura *`) já tem o
 * valor real — não inflar pra evitar double-count. Lump-sums
 * agendados ("<banco> cartão <mês>") são inflados com o map de
 * itemizados do mesmo cartão+mês.
 */
function inflateLumpSumForKpi(
  t: MonthTxRow,
  cardsByBankKey: Map<string, string>,
  itemizedByCardMonth: Map<string, number>,
): number {
  const merchant = (t.merchant ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  let amount = Number(t.amount_cents)
  const isFaturaPayment = merchant.startsWith("pagamento fatura")
  if (!isFaturaPayment && merchant.includes("cartao")) {
    for (const [bankKey, cardId] of cardsByBankKey) {
      if (merchant.includes(bankKey)) {
        const addon =
          itemizedByCardMonth.get(`${cardId}-${t.occurred_on.slice(0, 7)}`) ?? 0
        amount = Number(t.amount_cents) + addon
        break
      }
    }
  }
  return amount
}

/**
 * Bucketiza tx em totais mensais. Filtra cartões de crédito (charges
 * não viram KPI até virarem pagamento) e infla lump-sums agendados em
 * conta corrente. Mistura tx virtuais de pending captures.
 */
export function buildMonthlyTotals(args: {
  monthTx: MonthTxRow[]
  pending: PendingVirtualTx[]
  slots: MonthSlot[]
  formalIncomeIds: Set<string>
  creditAccountIds: Set<string>
  cardsByBankKey: Map<string, string>
  itemizedByCardMonth: Map<string, number>
}): MonthlyTotals[] {
  const {
    monthTx,
    pending,
    slots,
    formalIncomeIds,
    creditAccountIds,
    cardsByBankKey,
    itemizedByCardMonth,
  } = args
  return bucketizeTransactions(
    [
      ...monthTx
        .filter((t) => !creditAccountIds.has(t.account_id))
        .map((t) => ({
          occurred_on: t.occurred_on,
          type: t.type as "income" | "expense",
          amount_cents: inflateLumpSumForKpi(
            t,
            cardsByBankKey,
            itemizedByCardMonth,
          ),
          category_id: t.category_id,
          is_transfer: t.is_transfer ?? false,
        })),
      ...pending.map((p) => ({
        occurred_on: p.occurred_on,
        type: p.type,
        amount_cents: p.amount_cents,
        category_id: null,
        is_transfer: false,
      })),
    ],
    slots,
    formalIncomeIds,
  )
}

/**
 * Soma realized por conta. Cartão entra com tudo (charge é dívida
 * desde o swipe). Demais contas só com paid_at não-nulo.
 */
export function buildFlowByAccount(
  flowRealized: FlowTxRow[],
  accountTypeById: Map<string, AccountType>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of flowRealized) {
    const accType = accountTypeById.get(t.account_id)
    const isCreditAcc = accType === "credit"
    if (!isCreditAcc && t.paid_at == null) continue
    const delta =
      t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
    map.set(t.account_id, (map.get(t.account_id) ?? 0) + delta)
  }
  return map
}

/**
 * Pra cartões: calcula openCents real por fatura (mesma lógica do
 * /app/cartoes). Respeita closing_day, parseia mês/ano do merchant
 * pra lump-sums e transfer payments. Resultado: dívida exibida =
 * soma das faturas em aberto. Funciona certo em over-payment
 * (refunds, pagamento antecipado).
 */
export function buildOpenDebtByCard(
  cardCalcTxs: CardCalcTx[],
  accounts: AccountRow[],
): Map<string, number> {
  const openDebtByCard = new Map<string, number>()
  for (const card of accounts.filter((a) => (a.type as AccountType) === "credit")) {
    const closingDay = card.closing_day ?? null
    const cardBankKey = bankKeyOfCard(card.name)
    type Bucket = { total: number; paid: number }
    const byMonth = new Map<string, Bucket>()
    const ensure = (k: string): Bucket => {
      const b = byMonth.get(k) ?? { total: 0, paid: 0 }
      byMonth.set(k, b)
      return b
    }
    for (const t of cardCalcTxs) {
      // Pagamento via botão Pagar (par criado por pay_invoice RPC):
      // tx_kind='invoice_payment' + type=income no lado do cartão.
      if (
        t.tx_kind === "invoice_payment" &&
        t.account_id === card.id &&
        t.type === "income"
      ) {
        const k = merchantInvoiceMonth(t.merchant, t.occurred_on)
        ensure(k).paid += Number(t.amount_cents)
        continue
      }
      if (t.is_transfer) continue
      if (t.type !== "expense") continue
      if (t.account_id === card.id) {
        // Charge itemized: tx_kind='charge' (ou null legacy = backstop)
        if (t.tx_kind === "charge" || t.tx_kind === null) {
          const k = chargeInvoiceMonth(t.occurred_on, closingDay)
          ensure(k).total += Number(t.amount_cents)
        }
      } else {
        // lump-sum agendado em outra conta? (tx_kind=null + merchant match)
        if (t.tx_kind === "invoice_payment") continue // já contado acima
        const m = normalizeMerchant(t.merchant ?? "")
        if (!m.includes("cartao") || !m.includes(cardBankKey)) continue
        const k = merchantInvoiceMonth(t.merchant, t.occurred_on)
        ensure(k).total += Number(t.amount_cents)
        if (t.paid_at) ensure(k).paid += Number(t.amount_cents)
      }
    }
    let openSum = 0
    for (const b of byMonth.values()) {
      openSum += Math.max(0, b.total - b.paid)
    }
    openDebtByCard.set(card.id, openSum)
  }
  return openDebtByCard
}

/**
 * Detecta dívida "a pagar" de cartão a partir de merchants tipo
 * "<banco> Cartão <mês>" em qualquer conta — útil quando o user
 * registra a fatura como agendada na corrente em vez de itemizar as
 * compras no cartão. Só entra na dívida exibida se paid_at=null.
 *
 * Mantida pra paridade exata com o page.tsx original (mesmo que
 * `openDebtByCard` cubra isso) — o map é construído mas não usado
 * diretamente no display; serve como base de referência.
 */
export function buildDetectedCardDebt(
  allExpenseTx: ExpenseTxRow[],
  accounts: AccountRow[],
): Map<string, number> {
  const detectedCardDebt = new Map<string, number>()
  for (const card of accounts.filter((a) => (a.type as AccountType) === "credit")) {
    const key = bankKeyOfCard(card.name)
    if (!key) continue
    let debt = 0
    for (const t of allExpenseTx) {
      if (t.is_transfer) continue
      if (t.tx_kind === "invoice_payment") continue
      if (t.account_id === card.id) continue
      if (t.paid_at) continue
      const m = normalizeMerchant(t.merchant ?? "")
      if (!m.includes("cartao")) continue
      if (!m.includes(key)) continue
      debt += Number(t.amount_cents)
    }
    if (debt > 0) detectedCardDebt.set(card.id, debt)
  }
  return detectedCardDebt
}

/**
 * Saldo de cada conta pro hero/KPIs:
 * - Cartão: -openDebt (dívida em aberto, negativo).
 * - Demais: opening_balance + flowByAccount.
 */
export function buildAccountsWithBalance(
  accounts: AccountRow[],
  flowByAccount: Map<string, number>,
  openDebtByCard: Map<string, number>,
): AccountWithBalance[] {
  return accounts.map((a) => {
    const isCredit = (a.type as AccountType) === "credit"
    if (isCredit) {
      const open = openDebtByCard.get(a.id) ?? 0
      return {
        id: a.id,
        name: a.name,
        type: a.type as AccountType,
        balanceCents: -open,
      }
    }
    const balance =
      Number(a.opening_balance_cents ?? 0) + (flowByAccount.get(a.id) ?? 0)
    return {
      id: a.id,
      name: a.name,
      type: a.type as AccountType,
      balanceCents: balance,
    }
  })
}

export type GroupedAccounts = {
  liquidAccounts: AccountWithBalance[]
  savingsAccounts: AccountWithBalance[]
  investmentAccounts: AccountWithBalance[]
  cryptoAccounts: AccountWithBalance[]
  fgtsAccounts: AccountWithBalance[]
  creditAccounts: AccountWithBalance[]
}

export type GroupedTotals = {
  liquidCents: number
  savingsCents: number
  investmentCents: number
  cryptoCents: number
  fgtsCents: number
  creditCents: number
}

export function groupAccountsByType(
  accountsWithBalance: AccountWithBalance[],
): GroupedAccounts {
  const savingsAccounts = accountsWithBalance.filter(
    (a) => a.type === "savings" || a.type === "poupanca",
  )
  const investmentAccounts = accountsWithBalance.filter(
    (a) => a.type === "investment",
  )
  const cryptoAccounts = accountsWithBalance.filter((a) => a.type === "crypto")
  const fgtsAccounts = accountsWithBalance.filter((a) => a.type === "fgts")
  const creditAccounts = accountsWithBalance.filter((a) => a.type === "credit")
  const liquidAccounts = accountsWithBalance.filter(
    (a) =>
      a.type !== "savings" &&
      a.type !== "poupanca" &&
      a.type !== "investment" &&
      a.type !== "crypto" &&
      a.type !== "fgts" &&
      a.type !== "credit",
  )
  return {
    liquidAccounts,
    savingsAccounts,
    investmentAccounts,
    cryptoAccounts,
    fgtsAccounts,
    creditAccounts,
  }
}

export function sumGroupTotals(grouped: GroupedAccounts): GroupedTotals {
  const sum = (xs: AccountWithBalance[]) =>
    xs.reduce((s, a) => s + a.balanceCents, 0)
  return {
    liquidCents: sum(grouped.liquidAccounts),
    savingsCents: sum(grouped.savingsAccounts),
    investmentCents: sum(grouped.investmentAccounts),
    cryptoCents: sum(grouped.cryptoAccounts),
    fgtsCents: sum(grouped.fgtsAccounts),
    creditCents: sum(grouped.creditAccounts),
  }
}

/**
 * Saldo total exibido no hero. = dinheiro que você TEM nas contas
 * agora (líquido + savings + investimentos + cripto) − pendentes não
 * alocados. FGTS fora (bloqueado). Dívida de cartão NÃO é descontada
 * — o dinheiro ainda está na sua conta; só sai quando você paga a
 * fatura.
 */
export function buildTotalBalanceCents(
  totals: GroupedTotals,
  pendingNetCents: number,
): number {
  return (
    totals.liquidCents +
    totals.savingsCents +
    totals.investmentCents +
    totals.cryptoCents +
    pendingNetCents
  )
}

/**
 * Constrói uma função `effectiveAmountCents` que infla lump-sums de
 * fatura agendados em conta corrente com os charges itemized do
 * cartão correspondente. Reaproveitada por "Agendadas" e "Últimas
 * transações" — fonte única de verdade.
 */
export function makeEffectiveAmountFn(args: {
  cardsByBankKey: Map<string, string>
  itemizedByCardMonth: Map<string, number>
}): (t: {
  amount_cents: number | string
  merchant: string | null
  occurred_on: string
}) => number {
  const { cardsByBankKey, itemizedByCardMonth } = args
  return (t) => {
    const base = Number(t.amount_cents)
    const m = normalizeMerchant(t.merchant ?? "")
    if (m.startsWith("pagamento fatura")) return base
    if (!m.includes("cartao")) return base
    for (const [bankKey, cardId] of cardsByBankKey) {
      if (!m.includes(bankKey)) continue
      const addon =
        itemizedByCardMonth.get(`${cardId}-${t.occurred_on.slice(0, 7)}`) ?? 0
      return base + addon
    }
    return base
  }
}
