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
  // Busca TODAS as transações e depois decide quais pertencem a cada cartão:
  //   1) As que vivem no account_id do cartão (alocadas diretamente)
  //   2) As que vivem em outra conta mas o merchant casa com o padrão
  //      "<banco> cartão" (inferência — não mexe no ledger, só exibe)
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

  // Primeira palavra do nome do cartão serve de "marca" do banco pra match
  // no merchant. "Nubank Cartão" → "nubank"; "Caixa Econômica Federal
  // Cartão" → "caixa". Match exige "cartão" na descrição pra reduzir
  // falso positivo.
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()

  function bankKeyOf(cardName: string): string {
    const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
    return normalize(cleaned.split(/\s+/)[0] ?? "")
  }

  type CardRow = { id: string; name: string }
  function matchesCard(tx: CardTx, card: CardRow): boolean {
    if (tx.account_id === card.id) return true
    const m = normalize(tx.merchant ?? "")
    if (!m.includes("cartao")) return false
    const bank = bankKeyOf(card.name)
    return !!bank && m.includes(bank)
  }

  type InvoiceCharge = {
    id: string
    amount_cents: number
    occurred_on: string
    merchant: string | null
    paid_at: string | null
    isDetected: boolean // vive noutra conta, mas foi inferida pelo merchant
    accountName: string
  }

  const cardInvoices = (cards ?? []).map((card) => {
    const mine = allTxs.filter((t) => matchesCard(t, card))
    const byMonth = new Map<
      string,
      {
        charges: InvoiceCharge[]
        paidCents: number
        openCents: number
      }
    >()
    for (const t of mine) {
      if (t.is_transfer) continue // par de transferência (pagamento) não é charge
      if (t.type === "income") continue // estorno: ignora por ora
      const key = t.occurred_on.slice(0, 7)
      const bucket = byMonth.get(key) ?? {
        charges: [],
        paidCents: 0,
        openCents: 0,
      }
      const accName = allAccountsById.get(t.account_id)?.name ?? "conta"
      bucket.charges.push({
        id: t.id,
        amount_cents: Number(t.amount_cents),
        occurred_on: t.occurred_on,
        merchant: t.merchant,
        paid_at: t.paid_at,
        isDetected: t.account_id !== card.id,
        accountName: accName,
      })
      if (t.paid_at) bucket.paidCents += Number(t.amount_cents)
      else bucket.openCents += Number(t.amount_cents)
      byMonth.set(key, bucket)
    }
    const invoices = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => {
        const [y, m] = key.split("-")
        return {
          key,
          label: `${MONTH_NAMES_PT[Number(m) - 1]} ${y}`,
          chargeCents: v.paidCents + v.openCents,
          paidCents: v.paidCents,
          openCents: v.openCents,
          charges: v.charges.sort((a, b) =>
            a.occurred_on < b.occurred_on ? 1 : -1,
          ),
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
    chargeCents: number
    paidCents: number
    openCents: number
    charges: {
      id: string
      amount_cents: number
      occurred_on: string
      merchant: string | null
      paid_at: string | null
      isDetected: boolean
      accountName: string
    }[]
  }
}) {
  const allPaid = invoice.openCents === 0 && invoice.chargeCents > 0
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
            {invoice.charges.length} lançamento
            {invoice.charges.length === 1 ? "" : "s"} · Total{" "}
            {formatBRL(invoice.chargeCents)}
            {invoice.paidCents > 0 &&
              ` · pago ${formatBRL(invoice.paidCents)}`}
            {invoice.openCents > 0 &&
              ` · em aberto ${formatBRL(invoice.openCents)}`}
          </p>
        </div>
        <p
          className={`font-mono text-base font-semibold tabular-nums ${status.className}`}
        >
          {status.label}
        </p>
      </div>

      {invoice.charges.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {invoice.charges.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-3 py-1.5"
            >
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
