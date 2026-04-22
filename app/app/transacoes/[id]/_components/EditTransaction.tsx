"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { CategoryPicker, type Category as PickerCategory } from "@/components/CategoryPicker"
import { formatBRLWithoutSymbol, parseBRLToCents } from "@/lib/money"
import { deleteTransactionAction, updateTransactionAction } from "../../../actions"
import type { AccountType } from "@/lib/types"

type Account = { id: string; name: string; type: AccountType }
type Category = { id: string; name: string; is_income: boolean; parent_id: string | null }
type Type = "income" | "expense"

interface Transaction {
  id: string
  type: Type
  amount_cents: number
  occurred_on: string
  merchant: string | null
  note: string | null
  account_id: string
  category_id: string | null
  source: string
  raw_input: string | null
  paid_at: string | null
}

export function EditTransaction({
  transaction,
  accounts,
  categories,
}: {
  transaction: Transaction
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const [type, setType] = useState<Type>(transaction.type)
  const [amount, setAmount] = useState(formatBRLWithoutSymbol(transaction.amount_cents))
  const [occurredOn, setOccurredOn] = useState(transaction.occurred_on)
  const [accountId, setAccountId] = useState(transaction.account_id)
  const [categoryId, setCategoryId] = useState<string>(transaction.category_id ?? "")
  const [merchant, setMerchant] = useState(transaction.merchant ?? "")
  const [note, setNote] = useState(transaction.note ?? "")
  const [paid, setPaid] = useState<boolean>(transaction.paid_at !== null)
  const [pending, start] = useTransition()
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)

  useEffect(() => {
    setLocalCategories(categories)
  }, [categories])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        router.push("/app/transacoes")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cents = parseBRLToCents(amount)
    if (!cents || cents <= 0) {
      toast.error("Valor inválido.")
      return
    }
    start(async () => {
      try {
        await updateTransactionAction({
          id: transaction.id,
          type,
          amountCents: cents,
          occurredOn,
          accountId,
          categoryId: categoryId || null,
          merchant: merchant.trim() || null,
          note: note.trim() || null,
          paid,
        })
        toast.success("Atualizada.")
        router.push("/app/transacoes")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleDelete() {
    if (!confirm("Tem certeza que quer deletar esta transação?")) return
    start(async () => {
      try {
        await deleteTransactionAction(transaction.id)
        toast.success("Deletada.")
        router.push("/app/transacoes")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {transaction.raw_input && (
        <div className="rounded-md border border-border bg-subtle p-3 text-xs text-body">
          <span className="text-muted">Registrado via {transaction.source}:</span>{" "}
          <span className="font-mono">{transaction.raw_input}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={type === "expense" ? "default" : "outline"}
          onClick={() => setType("expense")}
        >
          Saída
        </Button>
        <Button
          type="button"
          variant={type === "income" ? "default" : "outline"}
          onClick={() => setType("income")}
        >
          Entrada
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Valor</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Data</Label>
          <Input
            id="date"
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Conta</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Categoria</Label>
        <CategoryPicker
          categories={localCategories}
          value={categoryId}
          onChange={setCategoryId}
          filterIsIncome={type === "income"}
          onCreated={(c: PickerCategory) =>
            setLocalCategories((prev) => [
              ...prev,
              {
                id: c.id,
                name: c.name,
                parent_id: c.parent_id,
                is_income: c.is_income,
              },
            ])
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="merchant">Estabelecimento</Label>
        <Input id="merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Observação</Label>
        <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <label className="flex items-start gap-2 rounded-md border border-border bg-subtle p-3 text-sm">
        <input
          type="checkbox"
          checked={paid}
          onChange={(event) => setPaid(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-strong">Já foi debitado</span>
          <span className="block text-xs text-muted">
            Marque para que este valor saia do saldo da conta imediatamente.
            Desmarque para deixar como agendado (fora do saldo até ser pago).
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          Salvar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={handleDelete}
        >
          Deletar
        </Button>
      </div>
    </form>
  )
}
