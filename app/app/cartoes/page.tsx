export const dynamic = "force-dynamic"
export const revalidate = 0

import { CreditCard } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"
import { CardsManager } from "./_components/CardsManager"
import { ClosingDayEditor } from "./_components/ClosingDayEditor"
import { InvoiceRow } from "./_components/InvoiceRow"
import { buildCardInvoices } from "@/lib/cartoes/helpers"
import type { CardTx } from "@/lib/cartoes/types"

export default async function CartoesPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

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
        "id, account_id, type, amount_cents, occurred_on, created_at, merchant, paid_at, is_transfer, tx_kind, category_id",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", user.id),
  ])

  const cardInvoices = buildCardInvoices({
    cards: cards ?? [],
    allTxs: (txsRaw ?? []) as CardTx[],
    categories: catsRaw ?? [],
    accounts: [...(cards ?? []), ...(checkingAccounts ?? [])],
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
