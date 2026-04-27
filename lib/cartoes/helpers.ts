// Agregações puras pra página /app/cartoes. Extraído do god-file pra
// page.tsx ficar < 300 linhas. Sem dependência de React/Next ou de
// supabase — recebe rows já buscadas e devolve a estrutura renderizada.

import { MONTH_NAMES_PT } from "@/lib/time"
import {
  bankKeyOfCard,
  chargeInvoiceMonth,
  merchantInvoiceMonth,
  normalizeMerchant,
} from "@/lib/invoices/bucket"
import type {
  AccountLite,
  CardInvoiceSummary,
  CardRow,
  CardTx,
  Category,
  Invoice,
  InvoiceCharge,
  MonthBucket,
} from "./types"

// Constrói a função "categoryLabel(catId)" → "Pai · Filha" ou nome
// flat. Recebe a lista de categorias e devolve closure pra reuso.
export function makeCategoryLabel(
  cats: Category[],
): (catId: string | null) => string | null {
  const byId = new Map(cats.map((c) => [c.id, c]))
  return (catId: string | null) => {
    if (!catId) return null
    const c = byId.get(catId)
    if (!c) return null
    if (c.parent_id) {
      const parent = byId.get(c.parent_id)
      return parent ? `${parent.name} · ${c.name}` : c.name
    }
    return c.name
  }
}

// Separa as txs de UM cartão em três grupos:
// - charges itemizados (compras direto no cartão)
// - lump-sums agendados em outras contas (merchant "Nubank Cartão Abril 2026")
// - transfer payments (tx_kind=invoice_payment do botão "Pagar fatura")
export function splitCardTxs(
  card: CardRow,
  allTxs: CardTx[],
): {
  charges: CardTx[]
  lumpSums: CardTx[]
  transferPayments: CardTx[]
} {
  const bankKey = bankKeyOfCard(card.name)
  // Charges: tx_kind='charge' nos casos novos. Backstop pra rows
  // antigas (sem tx_kind setado): expense não-transfer no próprio
  // cartão. (mig 0036 fez backfill; backstop só pra rows criadas
  // antes da 0036 que ainda escaparam.)
  const charges = allTxs.filter(
    (t) =>
      t.account_id === card.id &&
      (t.tx_kind === "charge" ||
        (t.tx_kind === null && !t.is_transfer && t.type === "expense")),
  )
  // Lump-sums agendados: continua via merchant string match, pois
  // são tx regulares (tx_kind=null) que o user criou em conta
  // corrente como agendamento. Não tem como inferir associação a
  // cartão pela tx_kind sozinha. Excluímos invoice_payment (criado
  // pelo botão Pagar — tem o seu lado próprio em transferPayments).
  const lumpSums = allTxs.filter((t) => {
    if (t.account_id === card.id) return false
    if (t.is_transfer) return false
    if (t.tx_kind === "invoice_payment") return false
    if (t.type !== "expense") return false
    const m = normalizeMerchant(t.merchant)
    if (m.startsWith("pagamento fatura")) return false // belt+suspenders
    if (!m.includes("cartao")) return false
    return !!bankKey && m.includes(bankKey)
  })
  // Pagamentos via botão "Pagar fatura" (payInvoiceAction): a tx
  // do lado do cartão é tx_kind='invoice_payment' + type='income'.
  // Bucketed pelo mês no merchant ("Pagamento fatura ... · Abril 2026").
  const transferPayments = allTxs.filter(
    (t) =>
      t.account_id === card.id &&
      t.tx_kind === "invoice_payment" &&
      t.type === "income",
  )
  return { charges, lumpSums, transferPayments }
}

// Buckets por mês de fatura (YYYY-MM). Insere charges, lump-sums e
// transfer payments no bucket certo respeitando closing_day pra
// itemized e merchantInvoiceMonth pros agendados/pagamentos.
export function buildInvoiceMonths(
  card: CardRow,
  groups: {
    charges: CardTx[]
    lumpSums: CardTx[]
    transferPayments: CardTx[]
  },
  ctx: {
    accountsById: Map<string, AccountLite>
    categoryLabel: (catId: string | null) => string | null
  },
): Map<string, MonthBucket> {
  const closingDay = card.closing_day ?? null
  const byMonth = new Map<string, MonthBucket>()
  const ensure = (key: string): MonthBucket => {
    const b = byMonth.get(key) ?? {
      lumpSumCents: 0,
      itemized: [],
      lumpSumEntries: [],
      paidCents: 0,
      transferPaidCents: 0,
    }
    byMonth.set(key, b)
    return b
  }

  for (const t of groups.charges) {
    const key = chargeInvoiceMonth(t.occurred_on, closingDay)
    const b = ensure(key)
    b.itemized.push({
      id: t.id,
      amount_cents: Number(t.amount_cents),
      occurred_on: t.occurred_on,
      created_at: t.created_at,
      merchant: t.merchant,
      paid_at: t.paid_at,
      isLumpSum: false,
      accountName: ctx.accountsById.get(t.account_id)?.name ?? "cartão",
      categoryLabel: ctx.categoryLabel(t.category_id),
    })
  }
  for (const t of groups.lumpSums) {
    const key = merchantInvoiceMonth(t.merchant, t.occurred_on)
    const b = ensure(key)
    b.lumpSumCents += Number(t.amount_cents)
    b.lumpSumEntries.push({
      id: t.id,
      amount_cents: Number(t.amount_cents),
      occurred_on: t.occurred_on,
      created_at: t.created_at,
      merchant: t.merchant,
      paid_at: t.paid_at,
      isLumpSum: true,
      accountName: ctx.accountsById.get(t.account_id)?.name ?? "conta",
      categoryLabel: ctx.categoryLabel(t.category_id),
    })
    if (t.paid_at) b.paidCents += Number(t.amount_cents)
  }
  for (const t of groups.transferPayments) {
    const key = merchantInvoiceMonth(t.merchant, t.occurred_on)
    const b = ensure(key)
    b.transferPaidCents += Number(t.amount_cents)
    // Adiciona o transfer payment como entry visível na fatura
    // (badge "pagamento" + botão void). isLumpSum=false pra UI
    // distinguir de lump-sum agendado; isInvoicePayment=true ativa
    // o botão Undo.
    b.lumpSumEntries.push({
      id: t.id,
      amount_cents: Number(t.amount_cents),
      occurred_on: t.occurred_on,
      created_at: t.created_at,
      merchant: t.merchant,
      paid_at: t.paid_at,
      isLumpSum: false,
      isInvoicePayment: true,
      accountName: card.name,
      categoryLabel: null,
    })
  }
  return byMonth
}

// Converte buckets em array de Invoice ordenado (mês mais recente
// primeiro). Faz o cálculo final de totalCents/openCents/paidCents.
export function bucketsToInvoices(
  byMonth: Map<string, MonthBucket>,
): Invoice[] {
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, v]) => {
      const [y, m] = key.split("-")
      const itemizedCents = v.itemized.reduce((s, c) => s + c.amount_cents, 0)
      // Lump-sum = valor BASE da fatura (original). Itemizados são
      // compras novas que ENTRAM em cima. Total = base + novas.
      const totalCents = v.lumpSumCents + itemizedCents
      // Total efetivamente quitado: lump-sum agendado pago +
      // pagamentos via transfer pair (botão Pagar).
      const totalPaidCents = v.paidCents + v.transferPaidCents
      const openCents = Math.max(0, totalCents - totalPaidCents)
      return {
        key,
        label: `${MONTH_NAMES_PT[Number(m) - 1]} ${y}`,
        totalCents,
        itemizedCents,
        lumpSumCents: v.lumpSumCents,
        paidCents: totalPaidCents,
        openCents,
        itemized: v.itemized.sort((a, b) =>
          a.occurred_on < b.occurred_on ? 1 : -1,
        ),
        lumpSumEntries: v.lumpSumEntries,
      }
    })
}

// Pipeline completo: cards + todas as txs + categorias + accounts →
// CardInvoiceSummary[] pronto pra renderizar. Cada card vira um
// resumo com suas faturas mensais.
export function buildCardInvoices(input: {
  cards: CardRow[]
  allTxs: CardTx[]
  categories: Category[]
  accounts: AccountLite[]
}): CardInvoiceSummary[] {
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]))
  const categoryLabel = makeCategoryLabel(input.categories)
  return input.cards.map((card) => {
    const groups = splitCardTxs(card, input.allTxs)
    const byMonth = buildInvoiceMonths(card, groups, {
      accountsById,
      categoryLabel,
    })
    const invoices = bucketsToInvoices(byMonth)
    const openDebtCents = invoices.reduce((s, i) => s + i.openCents, 0)
    return { card, invoices, openDebtCents }
  })
}

// Status visual da fatura — kind ∈ paid|partial|open. Glifo é
// redundante a cor (Conselheira de Design): daltonismo deuteranopia
// (~6% homens BR) lê verde/vermelho como tons iguais. ✓ / ● / ○ resolve.
export type InvoiceStatusKind = "paid" | "partial" | "open"

export function invoiceStatusKind(invoice: Invoice): InvoiceStatusKind {
  // Fatura paga: nada em aberto E houve pagamento. Cobre 2 casos:
  // - fatura normal totalmente quitada (total > 0, open = 0)
  // - fatura "vazia" mas com pagamento associado (total = 0, paid > 0)
  //   (acontece quando closing_day move charges pra outra fatura mas
  //   o transfer payment menciona o mês "vazio" no merchant)
  if (invoice.openCents === 0 && invoice.paidCents > 0) return "paid"
  if (invoice.paidCents > 0 && invoice.openCents > 0) return "partial"
  return "open"
}
