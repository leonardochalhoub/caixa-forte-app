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
  // Busca TODAS as tx pra detectar tanto os charges itemizados (no
  // cartão) quanto o lump-sum de fatura (em outra conta). Lump-sum
  // serve de source-of-truth pra "total da fatura"; itemizados são
  // breakdown.
  const { data: txsRaw } = await untyped(supabase)
    .from("transactions")
    .select(
      "id, account_id, type, amount_cents, occurred_on, merchant, paid_at, is_transfer",
    )
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: false })
  const allTxs = (txsRaw ?? []) as CardTx[]
  const allAccountsById = new Map(
    [...(cards ?? []), ...(checkingAccounts ?? [])].map((a) => [a.id, a]),
  )

  const normalize = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const bankKeyOf = (cardName: string): string => {
    const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
    return normalize(cleaned.split(/\s+/)[0] ?? "")
  }

  type InvoiceCharge = {
    id: string
    amount_cents: number
    occurred_on: string
    merchant: string | null
    paid_at: string | null
    isLumpSum: boolean
    accountName: string
  }

  const cardInvoices = (cards ?? []).map((card) => {
    const bankKey = bankKeyOf(card.name)
    // Separa em 2 grupos: tx no cartão (charges itemizados) e
    // lump-sums em OUTRAS contas cujo merchant contém "<banco> cartão".
    const charges = allTxs.filter(
      (t) =>
        t.account_id === card.id &&
        !t.is_transfer &&
        t.type === "expense",
    )
    const lumpSums = allTxs.filter((t) => {
      if (t.account_id === card.id) return false
      if (t.is_transfer) return false
      if (t.type !== "expense") return false
      const m = normalize(t.merchant ?? "")
      if (!m.includes("cartao")) return false
      return !!bankKey && m.includes(bankKey)
    })

    type MonthBucket = {
      lumpSumCents: number
      itemized: InvoiceCharge[]
      lumpSumEntries: InvoiceCharge[]
      paidCents: number
    }
    const byMonth = new Map<string, MonthBucket>()
    const ensure = (key: string): MonthBucket => {
      const b = byMonth.get(key) ?? {
        lumpSumCents: 0,
        itemized: [],
        lumpSumEntries: [],
        paidCents: 0,
      }
      byMonth.set(key, b)
      return b
    }

    for (const t of charges) {
      const key = t.occurred_on.slice(0, 7)
      const b = ensure(key)
      b.itemized.push({
        id: t.id,
        amount_cents: Number(t.amount_cents),
        occurred_on: t.occurred_on,
        merchant: t.merchant,
        paid_at: t.paid_at,
        isLumpSum: false,
        accountName: allAccountsById.get(t.account_id)?.name ?? "cartão",
      })
    }
    for (const t of lumpSums) {
      const key = t.occurred_on.slice(0, 7)
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
      })
      if (t.paid_at) b.paidCents += Number(t.amount_cents)
    }

    const invoices = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => {
        const [y, m] = key.split("-")
        const itemizedCents = v.itemized.reduce(
          (s, c) => s + c.amount_cents,
          0,
        )
        // Lump-sum (quando existe) É o total da fatura — atualizado pra
        // refletir as compras itemizadas. Itemizados são subset visível.
        // Sem lump-sum, total = soma dos itemizados.
        const totalCents = v.lumpSumCents > 0 ? v.lumpSumCents : itemizedCents
        const allLumpSumsPaid =
          v.lumpSumCents > 0 && v.paidCents >= v.lumpSumCents
        const openCents = allLumpSumsPaid ? 0 : totalCents - v.paidCents
        return {
          key,
          label: `${MONTH_NAMES_PT[Number(m) - 1]} ${y}`,
          totalCents,
          itemizedCents,
          lumpSumCents: v.lumpSumCents,
          paidCents: v.paidCents,
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
          {cardInvoices.map(({ card, invoices, openDebtCents }) => (
            <Card key={card.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-strong">{card.name}</h2>
                    <p className="text-xs text-muted">
                      {openDebtCents > 0
                        ? "Dívida em aberto (todas as faturas não pagas)"
                        : "Todas as faturas em dia"}
                    </p>
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
                      <InvoiceRow key={inv.key} invoice={inv} />
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
      accountName: string
    }[]
    lumpSumEntries: {
      id: string
      amount_cents: number
      occurred_on: string
      merchant: string | null
      paid_at: string | null
      isLumpSum: boolean
      accountName: string
    }[]
  }
}) {
  const allEntries = [...invoice.lumpSumEntries, ...invoice.itemized]
  const allPaid = invoice.openCents === 0 && invoice.totalCents > 0
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
            Total{" "}
            <span className="font-mono font-semibold text-strong">
              {formatBRL(invoice.totalCents)}
            </span>
            {invoice.itemizedCents > 0 && (
              <>
                {" · "}
                {invoice.itemized.length} compra
                {invoice.itemized.length === 1 ? "" : "s"} itemizada
                {invoice.itemized.length === 1 ? "" : "s"}{" "}
                <span className="font-mono text-body">
                  {formatBRL(invoice.itemizedCents)}
                </span>
                {invoice.lumpSumCents > invoice.itemizedCents && (
                  <>
                    {" (antes R$ "}
                    <span className="font-mono">
                      {(
                        (invoice.lumpSumCents - invoice.itemizedCents) /
                        100
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    {")"}
                  </>
                )}
              </>
            )}
            {invoice.paidCents > 0 && ` · pago ${formatBRL(invoice.paidCents)}`}
          </p>
        </div>
        <p
          className={`font-mono text-base font-semibold tabular-nums ${status.className}`}
        >
          {status.label}
        </p>
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
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  · {t.accountName}
                </span>
                {t.isLumpSum && (
                  <span className="shrink-0 rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-body">
                    fatura
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
              <span className="shrink-0 font-mono text-expense tabular-nums">
                − {formatBRL(t.amount_cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
