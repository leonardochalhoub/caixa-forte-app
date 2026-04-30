"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { todayIsoDate } from "@/lib/time"
import { parseBRLToCents } from "@/lib/money"
import { createAccount } from "../contas/actions"
import { createTransactionAction } from "../actions"
import type { AccountType } from "@/lib/types"

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta Corrente",
  credit: "Cartão",
  cash: "Dinheiro",
  wallet: "Carteira",
  savings: "Renda Fixa",
  investment: "Renda Variável",
  poupanca: "Poupança",
  crypto: "Cripto",
  fgts: "FGTS",
  ticket: "Vale-benefício",
}

const SUFFIXES = [
  "Conta Corrente",
  "Renda Variável",
  "Renda Fixa",
  "Cartão de Crédito",
  "Cartão",
  "Poupança",
  "Cripto",
  "FGTS",
  "Conta",
  "Variável",
  "Fixa",
  "Corrente",
]

function splitBank(name: string): { bank: string; sub: string | null } {
  const trimmed = name.trim()
  for (const suffix of SUFFIXES) {
    const re = new RegExp(`\\s+${suffix}$`, "i")
    if (re.test(trimmed)) {
      const bank = trimmed.replace(re, "").trim()
      if (bank.length >= 2) return { bank, sub: suffix }
    }
  }
  return { bank: trimmed, sub: null }
}

const NEW_ACCOUNT_SENTINEL = "__new-account__"

type Account = { id: string; name: string; type?: AccountType }
type Category = { id: string; name: string; is_income: boolean; parent_id: string | null }
type Type = "income" | "expense"

export function NewTransactionForm({
  accounts,
  categories,
  onSaved,
}: {
  accounts: Account[]
  categories: Category[]
  onSaved?: () => void
}) {
  const [type, setType] = useState<Type>("expense")
  const [amount, setAmount] = useState("")
  const [occurredOn, setOccurredOn] = useState(todayIsoDate())
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState<string>("")
  const [merchant, setMerchant] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()
  const [newAccountOpen, setNewAccountOpen] = useState(false)
  const router = useRouter()

  const groupedAccounts = useMemo(() => {
    const map = new Map<string, { bank: string; items: Array<Account & { sub: string | null }> }>()
    for (const a of accounts) {
      const { bank, sub } = splitBank(a.name)
      const key = bank.toLowerCase()
      const entry = map.get(key) ?? { bank, items: [] }
      entry.items.push({ ...a, sub })
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.bank.localeCompare(b.bank))
  }, [accounts])

  const knownBanks = useMemo(
    () => Array.from(new Set(groupedAccounts.map((g) => g.bank))),
    [groupedAccounts],
  )

  const filteredCategories = useMemo(() => {
    return categories
      .filter((c) => c.is_income === (type === "income"))
      .map((c) => {
        if (c.parent_id) {
          const parent = categories.find((p) => p.id === c.parent_id)
          return { ...c, label: parent ? `${parent.name} > ${c.name}` : c.name }
        }
        return { ...c, label: c.name }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [categories, type])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cents = parseBRLToCents(amount)
    if (!cents || cents <= 0) {
      toast.error("Valor inválido.")
      return
    }
    if (!accountId) {
      toast.error("Escolha uma conta.")
      return
    }

    start(async () => {
      try {
        await createTransactionAction({
          type,
          amountCents: cents,
          occurredOn,
          accountId,
          categoryId: categoryId || null,
          merchant: merchant.trim() || null,
          note: note.trim() || null,
        })
        toast.success("Transação registrada.")
        setAmount("")
        setMerchant("")
        setNote("")
        // Força re-fetch dos Server Components no cliente atual.
        // RealtimeTxRefresh já escuta INSERT na transactions table, mas
        // tem latência (subscribe → INSERT → broadcast → handler) que
        // o user percebia como "precisa F5". router.refresh() instantâneo
        // dá feedback imediato — Realtime serve pra OUTRAS abas/dispositivos.
        router.refresh()
        onSaved?.()
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
            placeholder="0,00"
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
        <Select
          value={accountId}
          onValueChange={(value) => {
            if (value === NEW_ACCOUNT_SENTINEL) {
              setNewAccountOpen(true)
              return
            }
            setAccountId(value)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {groupedAccounts.map((group, idx) => (
              <SelectGroup key={group.bank}>
                {idx > 0 && <SelectSeparator />}
                <SelectLabel>{group.bank}</SelectLabel>
                {group.items.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.sub ?? (a.type ? TYPE_LABELS[a.type] : a.name)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW_ACCOUNT_SENTINEL}>
              <span className="inline-flex items-center gap-1.5 text-strong">
                <Plus className="h-3.5 w-3.5" /> Nova conta / banco
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Categoria</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {filteredCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="merchant">Estabelecimento (opcional)</Label>
        <Input
          id="merchant"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          placeholder="Ex: Mercado da Maria"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Observação (opcional)</Label>
        <Input
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando..." : "Salvar transação"}
      </Button>

      <NewAccountDialog
        open={newAccountOpen}
        onOpenChange={setNewAccountOpen}
        knownBanks={knownBanks}
        onCreated={(id) => setAccountId(id)}
      />
    </form>
  )
}

function NewAccountDialog({
  open,
  onOpenChange,
  knownBanks,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  knownBanks: string[]
  onCreated: (id: string) => void
}) {
  const [bank, setBank] = useState("")
  const [nickname, setNickname] = useState("")
  const [kind, setKind] = useState<AccountType>("checking")
  const [opening, setOpening] = useState("")
  const [pending, start] = useTransition()

  function composeName() {
    const b = bank.trim()
    const n = nickname.trim()
    if (!b) return ""
    if (n) return `${b} ${n}`
    return `${b} ${TYPE_LABELS[kind]}`
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = composeName()
    if (!name) return
    const openingCents =
      opening.trim().length === 0 ? 0 : (parseBRLToCents(opening) ?? 0)
    start(async () => {
      try {
        const created = await createAccount({
          name,
          type: kind,
          openingBalanceCents: openingCents,
        })
        toast.success(`${name} criada.`)
        onCreated(created.id)
        setBank("")
        setNickname("")
        setOpening("")
        onOpenChange(false)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>
            Banco + tipo define onde a conta aparece. Use o apelido/ticker pra separar sub-contas
            do mesmo banco (ex: CM Capital · IRBR3).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dlg-bank">Banco</Label>
            <Input
              id="dlg-bank"
              value={bank}
              onChange={(event) => setBank(event.target.value)}
              placeholder="Ex: CM Capital"
              list="dlg-known-banks"
              required
            />
            <datalist id="dlg-known-banks">
              {knownBanks.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Conta Corrente</SelectItem>
                <SelectItem value="savings">Renda Fixa</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
                <SelectItem value="investment">Renda Variável</SelectItem>
                <SelectItem value="crypto">Cripto</SelectItem>
                <SelectItem value="fgts">FGTS</SelectItem>
                <SelectItem value="credit">Cartão</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="wallet">Carteira</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dlg-nick">Apelido / Ticker (opcional)</Label>
            <Input
              id="dlg-nick"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Ex: IRBR3, Conta Salário"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dlg-opening">Saldo inicial (opcional)</Label>
            <Input
              id="dlg-opening"
              inputMode="decimal"
              value={opening}
              onChange={(event) => setOpening(event.target.value)}
              placeholder="0,00"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !bank.trim()} className="w-full">
              {pending ? "Criando..." : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
