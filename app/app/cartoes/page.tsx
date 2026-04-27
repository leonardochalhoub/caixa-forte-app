export const dynamic = "force-dynamic"
export const revalidate = 0

import Link from "next/link"
import { CreditCard } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import { CardsManager } from "./_components/CardsManager"
import { ClosingDayEditor } from "./_components/ClosingDayEditor"
import { PayInvoiceButton } from "./_components/PayInvoiceButton"
import { VoidInvoicePaymentButton } from "./_components/VoidInvoicePaymentButton"
import { MONTH_NAMES_PT } from "@/lib/time"
import {
  bankKeyOfCard,
  chargeInvoiceMonth,
  merchantInvoiceMonth,
  normalizeMerchant,
} from "@/lib/invoices/bucket"

export default async function CartoesPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  type CardTx = {
    id: string
    account_id: string
    type: "income" | "expense"
    amount_cents: number
    occurred_on: string
    merchant: string | null
    paid_at: string | null
    is_transfer: boolean | null
    tx_kind: "charge" | "invoice_payment" | "refund" | "fee" | "transfer" | null
    category_id: string | null
  }

  // 4 queries paralelas — antes eram sequenciais (4x RTT do Supabase).
  // Busca TODAS as tx pra detectar tanto charges itemizados quanto o
  // lump-sum de fatura em outra conta. Categorias entram pra label
  // "Categoria > Subcategoria" em cada charge.
  const [
    { data: cards },
    { data: checkingAccounts },
    { data: txsRaw },
    { data: catsRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, opening_balance_cents, created_at, closing_day")
      .eq("user_id", user.id)
      .eq("type", "credit")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .in("type", ["checking", "cash", "wallet"])
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, merchant, paid_at, is_transfer, tx_kind, category_id",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", user.id),
  ])

  const allTxs = (txsRaw ?? []) as CardTx[]
  const categoriesById = new Map(
    (catsRaw ?? []).map((c) => [c.id, c]),
  )
  function categoryLabel(catId: string | null): string | null {
    if (!catId) return null
    const c = categoriesById.get(catId)
    if (!c) return null
    if (c.parent_id) {
      const parent = categoriesById.get(c.parent_id)
      return parent ? `${parent.name} · ${c.name}` : c.name
    }
    return c.name
  }
  const allAccountsById = new Map(
    [...(cards ?? []), ...(checkingAccounts ?? [])].map((a) => [a.id, a]),
  )

  type InvoiceCharge = {
    id: string
    amount_cents: number
    occurred_on: string
    merchant: string | null
    paid_at: string | null
    isLumpSum: boolean
    isInvoicePayment?: boolean
    accountName: string
    categoryLabel: string | null
  }

  const cardInvoices = (cards ?? []).map((card: {
    id: string
    name: string
    opening_balance_cents: number | null
    created_at: string
    closing_day?: number | null
  }) => {
    const bankKey = bankKeyOfCard(card.name)
    const closingDay = card.closing_day ?? null
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

    type MonthBucket = {
      lumpSumCents: number
      itemized: InvoiceCharge[]
      lumpSumEntries: InvoiceCharge[]
      paidCents: number
      // Pagamentos via transfer pair (botão "Pagar"). Independente
      // do lump-sum agendado.
      transferPaidCents: number
    }
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

    for (const t of charges) {
      const key = chargeInvoiceMonth(t.occurred_on, closingDay)
      const b = ensure(key)
      b.itemized.push({
        id: t.id,
        amount_cents: Number(t.amount_cents),
        occurred_on: t.occurred_on,
        merchant: t.merchant,
        paid_at: t.paid_at,
        isLumpSum: false,
        accountName: allAccountsById.get(t.account_id)?.name ?? "cartão",
        categoryLabel: categoryLabel(t.category_id),
      })
    }
    for (const t of lumpSums) {
      const key = merchantInvoiceMonth(t.merchant, t.occurred_on)
      const b = ensure(key)
      b.lumpSumCents += Number(t.amount_cents)
      b.lumpSumEntries.push({
        id: t.id,
        amount_cents: Number(t.amount_cents),
        occurred_on: t.occurred_on,
        merchant: t.merchant,
        paid_at: t.paid_at,
        isLumpSum: true,
        accountName: allAccountsById.get(t.account_id)?.name ?? "conta",
        categoryLabel: categoryLabel(t.category_id),
      })
      if (t.paid_at) b.paidCents += Number(t.amount_cents)
    }
    for (const t of transferPayments) {
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
        merchant: t.merchant,
        paid_at: t.paid_at,
        isLumpSum: false,
        isInvoicePayment: true,
        accountName: card.name,
        categoryLabel: null,
      })
    }

    const invoices = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => {
        const [y, m] = key.split("-")
        const itemizedCents = v.itemized.reduce(
          (s, c) => s + c.amount_cents,
          0,
        )
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

    const openDebtCents = invoices.reduce((s, i) => s + i.openCents, 0)
    return { card, invoices, openDebtCents }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-strong">
            <CreditCard className="h-5 w-5" />
            Cartões de Crédito
          </h1>
          <p className="text-sm text-muted">
            Faturas mensais por cartão. Pagamentos saem da conta corrente e zeram a
            fatura.
          </p>
        </div>
        <CardsManager checkingAccounts={checkingAccounts ?? []} />
      </div>

      {cardInvoices.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-muted" />
            <p className="text-sm text-muted">
              Você ainda não tem cartão de crédito cadastrado.
            </p>
            <p className="text-xs text-muted">
              Use o botão acima pra criar um. Depois atribua as compras em Pendentes
              ou pela conta corrente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(cardInvoices as Array<{
            card: { id: string; name: string; closing_day?: number | null }
            invoices: Array<Parameters<typeof InvoiceRow>[0]["invoice"]>
            openDebtCents: number
          }>).map(({ card, invoices, openDebtCents }) => (
            <Card key={card.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-medium text-strong">{card.name}</h2>
                    <p className="text-xs text-muted">
                      {openDebtCents > 0
                        ? "Dívida em aberto (todas as faturas não pagas)"
                        : "Todas as faturas em dia"}
                    </p>
                    <ClosingDayEditor
                      cardId={card.id}
                      closingDay={card.closing_day ?? null}
                    />
                  </div>
                  <p
                    className={`font-mono text-2xl font-semibold tabular-nums ${
                      openDebtCents > 0 ? "text-expense" : "text-income"
                    }`}
                  >
                    {formatBRL(openDebtCents)}
                  </p>
                </div>

                {invoices.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
                    Nenhuma compra nesse cartão ainda. Edite uma transação existente
                    e mude a conta para {card.name}, ou mande um áudio dizendo
                    &ldquo;no {card.name}&rdquo;.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {invoices.map((inv) => (
                      <InvoiceRow
                        key={inv.key}
                        invoice={inv}
                        cardId={card.id}
                        cardName={card.name}
                        checkingAccounts={checkingAccounts ?? []}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function InvoiceRow({
  invoice,
  cardId,
  cardName,
  checkingAccounts,
}: {
  invoice: {
    key: string
    label: string
    totalCents: number
    itemizedCents: number
    lumpSumCents: number
    paidCents: number
    openCents: number
    itemized: {
      id: string
      amount_cents: number
      occurred_on: string
      merchant: string | null
      paid_at: string | null
      isLumpSum: boolean
      isInvoicePayment?: boolean
      accountName: string
      categoryLabel: string | null
    }[]
    lumpSumEntries: {
      id: string
      amount_cents: number
      occurred_on: string
      merchant: string | null
      paid_at: string | null
      isLumpSum: boolean
      isInvoicePayment?: boolean
      accountName: string
      categoryLabel: string | null
    }[]
  }
  cardId: string
  cardName: string
  checkingAccounts: { id: string; name: string }[]
}) {
  const allEntries = [...invoice.lumpSumEntries, ...invoice.itemized]
  // Fatura paga: nada em aberto E houve pagamento. Cobre 2 casos:
  // - fatura normal totalmente quitada (total > 0, open = 0)
  // - fatura "vazia" mas com pagamento associado (total = 0, paid > 0)
  //   (acontece quando closing_day move charges pra outra fatura mas
  //   o transfer payment menciona o mês "vazio" no merchant)
  const allPaid = invoice.openCents === 0 && invoice.paidCents > 0
  const partial = invoice.paidCents > 0 && invoice.openCents > 0
  const status = allPaid
    ? { label: "PAGA", className: "text-income" }
    : partial
      ? {
          label: `${formatBRL(invoice.openCents)} em aberto`,
          className: "text-amber-600 dark:text-amber-400",
        }
      : { label: "EM ABERTO", className: "text-expense" }

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-strong">
            Fatura {invoice.label}
          </p>
          <p className="text-xs text-muted">
            {invoice.lumpSumCents > 0 && invoice.itemizedCents > 0 ? (
              <>
                Base{" "}
                <span className="font-mono text-body">
                  {formatBRL(invoice.lumpSumCents)}
                </span>
                {" + "}
                {invoice.itemized.length} compra
                {invoice.itemized.length === 1 ? "" : "s"}{" "}
                <span className="font-mono text-body">
                  {formatBRL(invoice.itemizedCents)}
                </span>
                {" = "}
                <span className="font-mono font-semibold text-strong">
                  {formatBRL(invoice.totalCents)}
                </span>
              </>
            ) : (
              <>
                Total{" "}
                <span className="font-mono font-semibold text-strong">
                  {formatBRL(invoice.totalCents)}
                </span>
              </>
            )}
            {invoice.paidCents > 0 && ` · pago ${formatBRL(invoice.paidCents)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p
            className={`font-mono text-base font-semibold tabular-nums ${status.className}`}
          >
            {status.label}
          </p>
          {invoice.openCents > 0 && (
            <PayInvoiceButton
              cardId={cardId}
              cardName={cardName}
              invoiceLabel={invoice.label}
              invoiceKey={invoice.key}
              amountCents={invoice.openCents}
              checkingAccounts={checkingAccounts}
            />
          )}
        </div>
      </div>

      {allEntries.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {allEntries.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-1.5">
              <Link
                href={`/app/transacoes/${t.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-body hover:text-strong"
              >
                <span className="shrink-0 tabular-nums">
                  {formatPtBrDateShort(t.occurred_on)}
                </span>
                <span className="truncate">
                  {t.merchant ?? "(sem merchant)"}
                </span>
                {t.categoryLabel ? (
                  <span className="shrink-0 truncate rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[9px] tracking-wide text-body">
                    {t.categoryLabel}
                  </span>
                ) : !t.isInvoicePayment && (
                  <span className="shrink-0 truncate rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    sem categoria
                  </span>
                )}
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  · {t.accountName}
                </span>
                {t.isLumpSum && (
                  <span className="shrink-0 rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-body">
                    fatura
                  </span>
                )}
                {t.isInvoicePayment && (
                  <span className="shrink-0 rounded-full border border-income/40 bg-income/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-income">
                    pagamento
                  </span>
                )}
                {t.paid_at ? (
                  <span className="shrink-0 rounded-full border border-income/40 bg-income/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-income">
                    paga
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    a pagar
                  </span>
                )}
              </Link>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  t.isInvoicePayment ? "text-income" : "text-expense"
                }`}
              >
                {t.isInvoicePayment ? "+" : "−"} {formatBRL(t.amount_cents)}
              </span>
              {t.isInvoicePayment && (
                <VoidInvoicePaymentButton
                  txId={t.id}
                  amountCents={t.amount_cents}
                  invoiceLabel={invoice.label}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
