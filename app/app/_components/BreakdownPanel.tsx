import type { ReactNode } from "react"
import { formatBRL } from "@/lib/money"
import { shortBankName, splitBankAndSub } from "@/lib/bank-taxonomy"
import { BankLogoImg } from "./BankLogoImg"

// Abrevia subs de vale-benefício pra "VA" (alimentação) ou "VR" (refeição)
// pra distinguir 2+ contas Ticket no mesmo painel sem repetir "Ticket"
// crú. User pediu: "se for Vale-alimentação, aparece Ticket VA;
// se for Vale-refeição, Ticket VR".
function abbreviateVale(sub: string | null): string | null {
  if (!sub) return null
  const norm = sub.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  if (norm.includes("alimenta")) return "VA"
  if (norm.includes("refeic") || norm.includes("refei")) return "VR"
  return null
}

export interface BreakdownAccount {
  id: string
  name: string
  balanceCents: number
}

export interface BreakdownPanelProps {
  icon: ReactNode
  title: string
  accounts: BreakdownAccount[]
  totalCents: number
  emptyHint: string
  dashed?: boolean
  footnote?: string
  // true = ordena do mais negativo pro menos (maior dívida primeiro).
  // Usado pelo painel de cartão.
  sortByDebt?: boolean
}

export function BreakdownPanel({
  icon,
  title,
  accounts,
  totalCents,
  emptyHint,
  dashed,
  footnote,
  sortByDebt,
}: BreakdownPanelProps) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border ${dashed ? "border-dashed" : ""} border-border bg-canvas/50 p-3`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted">
        {icon}
        {title}
      </div>
      <p className="font-mono text-xl font-semibold tabular-nums tracking-tight text-strong">
        {formatBRL(totalCents)}
      </p>
      {footnote && <p className="text-[10px] italic text-muted">{footnote}</p>}
      {accounts.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {[...accounts]
            .sort((a, b) =>
              sortByDebt
                ? a.balanceCents - b.balanceCents
                : b.balanceCents - a.balanceCents,
            )
            .map((acc) => {
              const { bank, sub } = splitBankAndSub(acc.name)
              const subAbbrev = abbreviateVale(sub)
              const label = subAbbrev
                ? `${shortBankName(bank)} ${subAbbrev}`
                : shortBankName(bank)
              return (
                <li
                  key={acc.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-body">
                    <BankLogoImg name={bank} />
                    <span className="truncate" title={acc.name}>
                      {label}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-body">
                    {formatBRL(acc.balanceCents)}
                  </span>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
