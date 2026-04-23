export const dynamic = "force-dynamic"
export const revalidate = 0

import Link from "next/link"
import { CreditCard } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import { CardsManager } from "./_components/CardsManager"

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export default async function CartoesPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const { data: cards } = await supabase
    .from("accounts")
    .select("id, name, opening_balance_cents, created_at")
    .eq("user_id", user.id)
    .eq("type", "credit")
    .is("archived_at", null)
    .order("sort_order")

  const { data: checkingAccounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id)
    .in("type", ["checking", "cash", "wallet"])
    .is("archived_at", null)
    .order("sort_order")

  const cardIds = (cards ?? []).map((c) => c.id)
  type CardTx = {
    id: string
    account_id: string
    type: "income" | "expense"
    amount_cents: number
    occurred_on: string
    merchant: string | null
    paid_at: string | null
    is_transfer: boolean | null
  }
  const { data: txsRaw } = cardIds.length
    ? await untyped(supabase)
        .from("transactions")
        .select(
          "id, account_id, type, amount_cents, occurred_on, merchant, paid_at, is_transfer",
        )
        .eq("user_id", user.id)
        .in("account_id", cardIds)
        .order("occurred_on", { ascending: false })
    : { data: [] }
  const txs = (txsRaw ?? []) as CardTx[]

  const cardInvoices = (cards ?? []).map((card) => {
    const mine = txs.filter((t) => t.account_id === card.id)
    const byMonth = new Map<
      string,
      { charges: CardTx[]; paid: CardTx[]; total: number; paidTotal: number }
    >()
    for (const t of mine) {
      const key = t.occurred_on.slice(0, 7)
      const bucket = byMonth.get(key) ?? {
        charges: [],
        paid: [],
        total: 0,
        paidTotal: 0,
      }
      if (t.is_transfer) {
        bucket.paid.push(t)
        bucket.paidTotal += Number(t.amount_cents)
      } else if (t.type === "expense") {
        bucket.charges.push(t)
        bucket.total += Number(t.amount_cents)
      } else {
        bucket.paid.push(t)
        bucket.paidTotal += Number(t.amount_cents)
      }
      byMonth.set(key, bucket)
    }
    const invoices = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => {
        const [y, m] = key.split("-")
        return {
          key,
          label: `${MONTH_NAMES_PT[Number(m) - 1]} ${y}`,
          chargeCents: v.total,
          paidCents: v.paidTotal,
          openCents: v.total - v.paidTotal,
          charges: v.charges,
          paid: v.paid,
        }
      })
    const runningBalance =
      Number(card.opening_balance_cents ?? 0) +
      mine.reduce(
        (s, t) =>
          s + (t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)),
        0,
      )
    return { card, invoices, runningBalance }
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
          {cardInvoices.map(({ card, invoices, runningBalance }) => (
            <Card key={card.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-strong">{card.name}</h2>
                    <p className="text-xs text-muted">
                      Dívida atual em aberto
                    </p>
                  </div>
                  <p
                    className={`font-mono text-2xl font-semibold tabular-nums ${
                      runningBalance < 0 ? "text-expense" : "text-strong"
                    }`}
                  >
                    {formatBRL(Math.abs(runningBalance))}
                  </p>
                </div>

                {invoices.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
                    Nenhuma compra nesse cartão ainda. Mande uma despesa pelo
                    Telegram dizendo &ldquo;no Nubank Cartão&rdquo; ou atribua via
                    Pendentes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {invoices.map((inv) => (
                      <InvoiceRow
                        key={inv.key}
                        cardId={card.id}
                        cardName={card.name}
                        invoice={inv}
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

import { PayInvoiceButton } from "./_components/PayInvoiceButton"

function InvoiceRow({
  cardId,
  cardName,
  invoice,
  checkingAccounts,
}: {
  cardId: string
  cardName: string
  invoice: {
    key: string
    label: string
    chargeCents: number
    paidCents: number
    openCents: number
    charges: { id: string; amount_cents: number; occurred_on: string; merchant: string | null }[]
    paid: { id: string; amount_cents: number; occurred_on: string; merchant: string | null }[]
  }
  checkingAccounts: { id: string; name: string }[]
}) {
  const closed = invoice.openCents <= 0 && invoice.chargeCents > 0
  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-strong">Fatura {invoice.label}</p>
          <p className="text-xs text-muted">
            {invoice.charges.length} compra
            {invoice.charges.length === 1 ? "" : "s"} ·{" "}
            {formatBRL(invoice.chargeCents)}
            {invoice.paidCents > 0 && ` · pago ${formatBRL(invoice.paidCents)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p
            className={`font-mono text-lg font-semibold tabular-nums ${
              closed ? "text-income" : "text-strong"
            }`}
          >
            {closed ? "PAGA" : formatBRL(invoice.openCents)}
          </p>
          {!closed && invoice.openCents > 0 && (
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
      {invoice.charges.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-strong">
            ver compras
          </summary>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {invoice.charges.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-3 py-1.5"
              >
                <Link
                  href={`/app/transacoes/${t.id}`}
                  className="truncate text-body hover:text-strong"
                >
                  {formatPtBrDateShort(t.occurred_on)} · {t.merchant ?? "(sem merchant)"}
                </Link>
                <span className="font-mono text-expense tabular-nums">
                  − {formatBRL(t.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}
