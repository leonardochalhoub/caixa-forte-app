import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"

interface Props {
  incomeCents: number
  expenseCents: number
  rangeLabel: string
}

export function KpiCards({ incomeCents, expenseCents, rangeLabel }: Props) {
  const balance = incomeCents - expenseCents

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted">{rangeLabel}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <ArrowUp className="h-8 w-8 text-income" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Entrou</p>
              <p className="text-2xl font-semibold text-strong tabular-nums">
                {formatBRL(incomeCents)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <ArrowDown className="h-8 w-8 text-expense" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Saiu</p>
              <p className="text-2xl font-semibold text-strong tabular-nums">
                {formatBRL(expenseCents)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Minus className="h-8 w-8 text-muted" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Saldo</p>
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  balance < 0 ? "text-expense" : "text-strong"
                }`}
              >
                {formatBRL(balance)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
