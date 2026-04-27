"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateTimeShort } from "@/lib/time"
import type { AccountType } from "@/lib/types"
import { deleteTransactionAction } from "../../actions"

type Account = { id: string; name: string; type: AccountType }
type Category = { id: string; name: string; is_income: boolean; parent_id: string | null }

interface Transaction {
  id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  created_at?: string | null
  merchant: string | null
  note: string | null
  needs_review: boolean
  account_id: string
  category_id: string | null
}

type TypeFilter = "all" | "income" | "expense"

export function TransactionsTable({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [accountFilter, setAccountFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [pending, start] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false
      if (accountFilter !== "all" && tx.account_id !== accountFilter) return false
      if (categoryFilter !== "all" && tx.category_id !== categoryFilter) return false
      if (!q) return true
      const haystack = [
        tx.merchant ?? "",
        tx.note ?? "",
        labelCategory(tx.category_id),
        accountMap.get(tx.account_id)?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [search, typeFilter, accountFilter, categoryFilter, transactions, accountMap, categoryMap])

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        Nenhuma transação ainda.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_140px_180px_180px]">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="income">Entradas</SelectItem>
            <SelectItem value="expense">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories
              .filter((c) => !c.parent_id)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {filtered.map((tx) => {
          const isIncome = tx.type === "income"
          const account = accountMap.get(tx.account_id)
          const isDeleting = deletingId === tx.id
          return (
            <li
              key={tx.id}
              className={`flex items-center gap-2 pr-2 transition-colors hover:bg-subtle ${
                isDeleting ? "opacity-50" : ""
              }`}
            >
              <Link
                href={`/app/transacoes/${tx.id}`}
                className="flex flex-1 items-center gap-4 px-4 py-3 min-w-0"
              >
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
                    {tx.needs_review && <Badge variant="review">Revisar</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {formatPtBrDateTimeShort(tx.occurred_on, tx.created_at)} · {labelCategory(tx.category_id)}
                    {account ? ` · ${account.name}` : ""}
                  </p>
                </div>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isIncome ? "text-income" : "text-expense"
                  }`}
                >
                  {isIncome ? "+" : "−"} {formatBRL(tx.amount_cents)}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted hover:bg-expense/10 hover:text-expense"
                onClick={() => handleDelete(tx.id, tx.merchant)}
                disabled={pending}
                aria-label={`Deletar ${tx.merchant ?? "transação"}`}
                title="Deletar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Nenhuma transação com esses filtros.
          </li>
        )}
      </ul>
    </div>
  )
}
