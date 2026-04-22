"use client"

import { useState, useTransition } from "react"
import { Archive, Landmark, Scale } from "lucide-react"
import { bankLogoCandidates } from "@/lib/bank-logos"
import { shortBankName, splitBankAndSub } from "@/lib/bank-taxonomy"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { formatBRL, parseBRLToCents } from "@/lib/money"
import type { AccountType } from "@/lib/types"
import { archiveAccount, createAccount, reconcileAccountBalance } from "../actions"

type Account = {
  id: string
  name: string
  type: AccountType
  sort_order: number
  archived_at: string | null
  openingBalanceCents: number
  flowCents: number
  balanceCents: number
}

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
}

interface BankGroup {
  bank: string
  bankDisplay: string
  accounts: Array<Account & { subLabel: string | null }>
  totalBalanceCents: number
  isFgts: boolean
}

// FGTS accounts always get their own card (not grouped with the bank's
// checking) because FGTS is a separate, locked asset class that doesn't
// count toward the main balance.
function groupByBank(accounts: Account[]): BankGroup[] {
  const groups = new Map<string, BankGroup>()
  for (const a of accounts) {
    const { bank, sub } = splitBankAndSub(a.name)
    const isFgts = a.type === "fgts"
    const key = isFgts ? `${bank.toLowerCase()}::fgts` : bank.toLowerCase()
    const bankDisplay = isFgts ? `${bank} · FGTS` : bank
    const entry =
      groups.get(key) ?? {
        bank,
        bankDisplay,
        accounts: [],
        totalBalanceCents: 0,
        isFgts,
      }
    entry.accounts.push({ ...a, subLabel: sub })
    entry.totalBalanceCents += a.balanceCents
    groups.set(key, entry)
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isFgts !== b.isFgts) return a.isFgts ? 1 : -1
    return b.totalBalanceCents - a.totalBalanceCents
  })
}

export function AccountsManager({ accounts }: { accounts: Account[] }) {
  const [newBank, setNewBank] = useState("")
  const [newNickname, setNewNickname] = useState("")
  const [newType, setNewType] = useState<AccountType>("checking")
  const [newOpeningStr, setNewOpeningStr] = useState("")
  const [pending, start] = useTransition()

  const active = accounts.filter((a) => !a.archived_at)
  const archived = accounts.filter((a) => a.archived_at)
  const groups = groupByBank(active)

  const knownBanks = Array.from(new Set(groups.map((g) => g.bank))).sort((a, b) =>
    a.localeCompare(b),
  )

  function composeName() {
    const bank = newBank.trim()
    const nickname = newNickname.trim()
    if (!bank) return ""
    if (nickname) return `${bank} ${nickname}`
    return `${bank} ${TYPE_LABELS[newType]}`
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = composeName()
    if (!name) return
    const openingCents =
      newOpeningStr.trim().length === 0 ? 0 : (parseBRLToCents(newOpeningStr) ?? 0)
    start(async () => {
      try {
        await createAccount({
          name,
          type: newType,
          openingBalanceCents: openingCents,
        })
        toast.success(`${name} criada.`)
        setNewBank("")
        setNewNickname("")
        setNewOpeningStr("")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleArchive(id: string) {
    start(async () => {
      try {
        await archiveAccount(id)
        toast.success("Conta arquivada.")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-strong">Criar conta</h3>
              <p className="text-xs text-muted">
                Pra adicionar um banco novo, é só digitar o nome dele — não precisa cadastrar
                antes. Buscamos o logo automático pelo domínio oficial. Contas do mesmo banco
                agrupam juntas.
              </p>
            </div>
            {composeName() && (
              <p className="hidden shrink-0 text-right text-xs text-muted sm:block">
                Será salva como
                <br />
                <span className="font-medium text-strong">{composeName()}</span>
              </p>
            )}
          </div>
          <form
            onSubmit={handleCreate}
            className="grid gap-2 sm:grid-cols-[1fr_160px_1fr_160px_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor="new-bank" className="text-[10px] uppercase tracking-wider text-muted">
                Banco (digite qualquer um)
              </Label>
              <Input
                id="new-bank"
                value={newBank}
                onChange={(event) => setNewBank(event.target.value)}
                placeholder="Nubank, CM Capital, Binance..."
                list="known-banks"
                required
              />
              <datalist id="known-banks">
                {knownBanks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted">Tipo</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as AccountType)}>
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

            <div className="space-y-1">
              <Label
                htmlFor="new-nickname"
                className="text-[10px] uppercase tracking-wider text-muted"
              >
                Apelido / Ticker (opcional)
              </Label>
              <Input
                id="new-nickname"
                value={newNickname}
                onChange={(event) => setNewNickname(event.target.value)}
                placeholder="Ex: IRBR3, Conta Salário"
              />
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="new-opening"
                className="text-[10px] uppercase tracking-wider text-muted"
              >
                Saldo inicial
              </Label>
              <Input
                id="new-opening"
                value={newOpeningStr}
                onChange={(event) => setNewOpeningStr(event.target.value)}
                placeholder="Opcional"
                inputMode="decimal"
              />
            </div>

            <Button
              type="submit"
              disabled={pending || !newBank.trim()}
              className="self-end"
            >
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <BankCard
            key={`${group.bank}${group.isFgts ? "::fgts" : ""}`}
            group={group}
            pending={pending}
            onArchive={handleArchive}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Arquivadas</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {archived.map((account) => (
              <li key={account.id} className="px-4 py-2 text-sm text-muted">
                {account.name} · {TYPE_LABELS[account.type]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function BankLogo({ name }: { name: string }) {
  const candidates = bankLogoCandidates(name)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const url = !failed && candidates[index] ? candidates[index] : null

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-subtle text-strong">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={`Logo ${name}`}
          className="h-6 w-6 object-contain"
          loading="lazy"
          onError={() => {
            if (index + 1 < candidates.length) setIndex(index + 1)
            else setFailed(true)
          }}
        />
      ) : (
        <Landmark className="h-4 w-4" aria-hidden />
      )}
    </span>
  )
}

function BankCard({
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
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-strong">
                  {acc.subLabel ?? TYPE_LABELS[acc.type]}
                </p>
              </div>
              <p
                className={`font-mono text-sm font-semibold tabular-nums ${
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ReconcileDialog({
  accountId,
  accountName,
  computedCents,
  disabled,
}: {
  accountId: string
  accountName: string
  computedCents: number
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [declared, setDeclared] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()

  const declaredCents = parseBRLToCents(declared)
  const diffCents = declaredCents != null ? declaredCents - computedCents : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (declaredCents == null) {
      toast.error("Valor inválido.")
      return
    }
    start(async () => {
      try {
        const result = await reconcileAccountBalance({
          accountId,
          declaredCents,
          note: note.trim() || null,
        })
        if (result.diffCents === 0) {
          toast.success("Saldo bate — sem ajuste.")
        } else {
          toast.success(
            `Ajuste de ${formatBRL(Math.abs(result.diffCents))} registrado ${
              result.diffCents > 0 ? "a crédito" : "a débito"
            }.`,
          )
        }
        setOpen(false)
        setDeclared("")
        setNote("")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted hover:text-strong"
          title="Ajustar saldo"
          disabled={disabled}
        >
          <Scale className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar saldo — {accountName}</DialogTitle>
          <DialogDescription>
            Informe quanto realmente está nessa conta. Se for diferente do calculado, criamos um
            ajuste com sua justificativa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 rounded-md border border-border bg-subtle p-3 text-sm">
            <p className="text-xs text-muted">Calculado pelo Caixa Forte</p>
            <p className="font-mono text-lg tabular-nums text-strong">
              {formatBRL(computedCents)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="declared">Saldo real agora</Label>
            <Input
              id="declared"
              inputMode="decimal"
              value={declared}
              onChange={(event) => setDeclared(event.target.value)}
              placeholder="0,00"
              required
            />
          </div>

          {diffCents !== null && diffCents !== 0 && (
            <div
              className={`rounded-md border p-3 text-sm ${
                diffCents > 0
                  ? "border-income/40 bg-income/5 text-income"
                  : "border-expense/40 bg-expense/5 text-expense"
              }`}
            >
              <p className="font-medium">
                Diferença: {diffCents > 0 ? "+" : "−"} {formatBRL(Math.abs(diffCents))}
              </p>
              <p className="text-xs opacity-80">
                {diffCents > 0
                  ? "Vamos criar uma entrada de ajuste pra cima. Por que sobra essa diferença?"
                  : "Vamos criar uma saída de ajuste pra baixo. Onde foi essa diferença?"}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Justificativa (opcional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex: dinheiro em espécie que esqueci de registrar"
            />
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={pending || declaredCents == null}>
              {pending ? "Registrando..." : diffCents === 0 ? "Confirmar (sem ajuste)" : "Confirmar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
