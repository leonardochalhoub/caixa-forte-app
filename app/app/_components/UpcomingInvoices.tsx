// Card "Próximas faturas" do dashboard. Lista cartões com dívida em
// aberto e valor agregado. Linka pra /app/cartoes pra detalhe + pagar.
//
// User pediu: "na página principal nãoexiste uma linha para a próxima
// fatura (adicione) do cartão de crédito"
//
// Server Component — só markup.

import Link from "next/link"
import { CreditCard, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"

type CardLine = {
  id: string
  name: string
  openDebtCents: number
  closingDay: number | null
}

export function UpcomingInvoices({ cards }: { cards: CardLine[] }) {
  const withDebt = cards.filter((c) => c.openDebtCents > 0)
  if (withDebt.length === 0) return null

  const totalDebt = withDebt.reduce((s, c) => s + c.openDebtCents, 0)

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-strong">
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              Próximas faturas
            </h2>
            <p className="text-xs text-muted">
              Total em aberto:{" "}
              <span className="font-mono tabular-nums text-expense">
                {formatBRL(totalDebt)}
              </span>
              . Pague em /app/cartoes pra zerar a dívida.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {withDebt
            .sort((a, b) => b.openDebtCents - a.openDebtCents)
            .map((c) => (
              <li key={c.id}>
                <Link
                  href="/app/cartoes"
                  className="group flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-subtle"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-expense/10">
                    <CreditCard className="h-3.5 w-3.5 text-expense" />
                  </span>
                  <div className="flex-1">
                    <p className="truncate font-medium text-strong">{c.name}</p>
                    <p className="text-xs text-muted">
                      {c.closingDay
                        ? `Fecha dia ${c.closingDay}`
                        : "Sem dia de fechamento configurado"}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-expense">
                    {formatBRL(c.openDebtCents)}
                  </p>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  )
}
