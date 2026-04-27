"use client"

import { Archive } from "lucide-react"
import { shortBankName } from "@/lib/bank-taxonomy"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"
import {
  defaultClassificationFor,
  TYPE_LABELS,
  type BankGroup,
} from "@/lib/accounts/helpers"
import { BankLogo } from "./BankLogo"
import { ClassificationPicker } from "./ClassificationPicker"
import { ReconcileDialog } from "./ReconcileDialog"

export function BankCard({
  group,
  pending,
  onArchive,
}: {
  group: BankGroup
  pending: boolean
  onArchive: (id: string) => void
}) {
  const count = group.accounts.length
  const countLabel = `${count} ${count === 1 ? "conta" : "contas"}`
  const headerName = group.bankDisplay

  return (
    <Card className="relative">
      <CardContent className="space-y-4 p-5">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <BankLogo name={group.bank} />
            <div className="min-w-0 flex-1">
              <h2
                className="truncate text-sm font-semibold tracking-tight text-strong"
                title={headerName}
              >
                <span className="hidden sm:inline">{headerName}</span>
                <span className="sm:hidden">
                  {group.isFgts
                    ? `${shortBankName(group.bank, 14)} · FGTS`
                    : shortBankName(group.bank, 14)}
                </span>
              </h2>
              <p className="text-[10px] uppercase tracking-wider text-muted">
                {countLabel}
              </p>
            </div>
          </div>
          <p
            className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${
              group.totalBalanceCents < 0 ? "text-expense" : "text-strong"
            }`}
          >
            {formatBRL(group.totalBalanceCents)}
          </p>
          {group.isFgts && (
            <p className="text-[10px] italic text-muted">
              não entra no saldo total
            </p>
          )}
        </header>

        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-subtle">
          {group.accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex flex-col gap-1.5 px-3 py-2.5 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-medium text-strong">
                  {acc.subLabel ?? TYPE_LABELS[acc.type]}
                </p>
                <p
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                    acc.balanceCents < 0 ? "text-expense" : "text-strong"
                  }`}
                >
                  {formatBRL(acc.balanceCents)}
                </p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ReconcileDialog
                    accountId={acc.id}
                    accountName={acc.name}
                    computedCents={acc.balanceCents}
                    disabled={pending}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted hover:text-strong"
                    onClick={() => onArchive(acc.id)}
                    disabled={pending}
                    title="Arquivar"
                    aria-label={`Arquivar ${acc.name}`}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <ClassificationPicker
                accountId={acc.id}
                current={acc.balanceClassification ?? null}
                defaultGuess={defaultClassificationFor(acc.type)}
                disabled={pending}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
