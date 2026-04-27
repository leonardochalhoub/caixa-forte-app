// Card "Agendadas · ainda não pagas" do dashboard. Extraído de
// page.tsx pra manter o Server Component enxuto. Server Component
// (sem "use client") — só renderiza markup estático com Link.

import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"

export type UpcomingItem = {
  id: string
  type: string
  merchant: string | null
  note: string | null
  occurred_on: string
  account_id: string
  amount_cents: number | string
}

type Props = {
  items: UpcomingItem[]
  upcomingNet: number
  accountNameMap: Map<string, string>
  effectiveAmountCents: (t: {
    amount_cents: number | string
    merchant: string | null
    occurred_on: string
  }) => number
}

export function UpcomingList({
  items,
  upcomingNet,
  accountNameMap,
  effectiveAmountCents,
}: Props) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-medium text-strong">
              Agendadas · ainda não pagas
            </h2>
            <p className="text-xs text-muted">
              Total a vencer:{" "}
              <span
                className={`font-mono tabular-nums ${
                  upcomingNet < 0 ? "text-expense" : "text-income"
                }`}
              >
                {formatBRL(upcomingNet)}
              </span>
              . Marque como paga ao editar para incluir no saldo.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {items.map((t) => {
            const isIncome = t.type === "income"
            return (
              <li key={t.id}>
                <Link
                  href={`/app/transacoes/${t.id}`}
                  className="group flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-subtle"
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      isIncome ? "bg-income/10" : "bg-expense/10"
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUp className="h-3.5 w-3.5 text-income" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 text-expense" />
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="truncate font-medium text-strong">
                      {t.merchant ?? t.note ?? "Sem descrição"}
                    </p>
                    <p className="text-xs text-muted">
                      {formatPtBrDateShort(t.occurred_on)} ·{" "}
                      {accountNameMap.get(t.account_id) ?? "conta"}
                    </p>
                  </div>
                  <p
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      isIncome ? "text-income" : "text-expense"
                    }`}
                  >
                    {isIncome ? "+" : "−"} {formatBRL(effectiveAmountCents(t))}
                  </p>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
