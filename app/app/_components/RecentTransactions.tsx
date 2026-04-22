"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { formatInSaoPaulo, formatPtBrDateShort } from "@/lib/time"
import type { AccountType } from "@/lib/types"
import { deleteTransactionAction } from "../actions"

type Account = { id: string; name: string; type: AccountType }
type Category = { id: string; name: string; is_income: boolean; parent_id: string | null }

interface Transaction {
  id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  merchant: string | null
  note: string | null
  needs_review: boolean
  account_id: string
  category_id: string | null
  created_at: string
  paid_at: string | null
}

const INITIAL_LIMIT = 10
const STEP = 10

export function RecentTransactions({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}) {
  const [shown, setShown] = useState(INITIAL_LIMIT)
  const [pending, start] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        Nenhuma transação ainda.
      </div>
    )
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const accountMap = new Map(accounts.map((a) => [a.id, a]))

  function labelCategory(id: string | null): string {
    if (!id) return "Sem categoria"
    const c = categoryMap.get(id)
    if (!c) return "—"
    if (c.parent_id) {
      const parent = categoryMap.get(c.parent_id)
      return parent ? `${parent.name} > ${c.name}` : c.name
    }
    return c.name
  }

  function handleDelete(id: string, merchant: string | null) {
    const label = merchant ?? "esta transação"
    if (!confirm(`Deletar "${label}"?`)) return
    setDeletingId(id)
    start(async () => {
      try {
        await deleteTransactionAction(id)
        toast.success("Transação deletada.")
      } catch (error) {
        toast.error((error as Error).message)
      } finally {
        setDeletingId(null)
      }
    })
  }

  // Sort by effective date descending (occurred_on), falling back to
  // created_at so ties within the same day keep a stable order.
  const sorted = [...transactions].sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) {
      return a.occurred_on < b.occurred_on ? 1 : -1
    }
    return a.created_at < b.created_at ? 1 : -1
  })
  const visible = sorted.slice(0, shown)
  const remaining = sorted.length - visible.length

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-subtle">
        {visible.map((tx) => {
          const isIncome = tx.type === "income"
          const registeredTime = formatInSaoPaulo(new Date(tx.created_at), "HH:mm")
          const isDeleting = deletingId === tx.id
          return (
            <li
              key={tx.id}
              className={`group flex items-center gap-2 pr-2 transition-colors hover:bg-canvas ${
                isDeleting ? "opacity-40" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isIncome ? "bg-income/10" : "bg-expense/10"
                  }`}
                  aria-hidden
                >
                  {isIncome ? (
                    <ArrowUp className="h-4 w-4 text-income" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-expense" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-strong">
                      {tx.merchant ?? tx.note ?? labelCategory(tx.category_id)}
                    </p>
                    {tx.paid_at && (
                      <span
                        title={`Pago com ${accountMap.get(tx.account_id)?.name ?? "conta"}`}
                        className="shrink-0 text-income"
                        aria-label="pago"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {!tx.paid_at && (
                      <Badge variant="muted" className="text-[10px]">
                        Agendada
                      </Badge>
                    )}
                    {tx.needs_review && <Badge variant="review">Revisar</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono tabular-nums">
                      {formatPtBrDateShort(tx.occurred_on)} · {registeredTime}
                    </span>{" "}
                    · {labelCategory(tx.category_id)}
                  </p>
                </div>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isIncome ? "text-income" : "text-expense"
                  }`}
                >
                  {isIncome ? "+" : "−"} {formatBRL(tx.amount_cents)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted hover:bg-border hover:text-strong"
                  title="Editar"
                >
                  <Link href={`/app/transacoes/${tx.id}`} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted hover:bg-expense/10 hover:text-expense"
                  onClick={() => handleDelete(tx.id, tx.merchant)}
                  disabled={pending}
                  aria-label={`Deletar ${tx.merchant ?? "transação"}`}
                  title="Deletar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {remaining > 0 && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShown((n) => n + STEP)}
            className="gap-1.5"
          >
            <ChevronDown className="h-4 w-4" />
            Mostrar mais ({Math.min(STEP, remaining)} de {remaining})
          </Button>
        </div>
      )}
    </div>
  )
}
