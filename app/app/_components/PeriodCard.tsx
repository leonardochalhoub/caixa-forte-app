import { ArrowDown, ArrowUp } from "lucide-react"
import { formatBRL } from "@/lib/money"

export interface PeriodCardProps {
  label: string
  incomeCents: number
  expenseCents: number
  netCents: number
  subtitle: string
  isProjection?: boolean
  why?: string
}

export function PeriodCard({
  label,
  incomeCents,
  expenseCents,
  netCents,
  subtitle,
  isProjection,
  why,
}: PeriodCardProps) {
  const netColor = netCents < 0 ? "text-expense" : "text-ink"

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-canvas p-5 transition-colors hover:border-muted ${
        isProjection ? "border-dashed" : ""
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</p>

      <div className="mt-3 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <ArrowUp className="h-3 w-3 text-income" />
            Entrada
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-strong">
            {formatBRL(incomeCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <ArrowDown className="h-3 w-3 text-expense" />
            Saída
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-strong">
            {formatBRL(expenseCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">Saldo</span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums tracking-tight ${netColor}`}
          >
            {formatBRL(netCents)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">{subtitle}</p>
      {why && (
        <p className="mt-2 text-xs leading-snug text-body">{why}</p>
      )}
    </div>
  )
}
