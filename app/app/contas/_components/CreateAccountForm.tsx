"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { parseBRLToCents } from "@/lib/money"
import type { AccountType } from "@/lib/types"
import { TYPE_LABELS } from "@/lib/accounts/helpers"
import { createAccount } from "../actions"

export function CreateAccountForm({ knownBanks }: { knownBanks: string[] }) {
  const [newBank, setNewBank] = useState("")
  const [newNickname, setNewNickname] = useState("")
  const [newType, setNewType] = useState<AccountType>("checking")
  const [newOpeningStr, setNewOpeningStr] = useState("")
  // ticket é por natureza rendimento formal (vale-benefício corporativo);
  // outros tipos default false e o user marca se quiser.
  const [isFormalIncome, setIsFormalIncome] = useState(false)
  const [pending, start] = useTransition()

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
    // Auto-flag: ticket sempre formal income (regra de negócio).
    const formalFlag = newType === "ticket" ? true : isFormalIncome
    start(async () => {
      try {
        await createAccount({
          name,
          type: newType,
          openingBalanceCents: openingCents,
          isFormalIncome: formalFlag,
        })
        toast.success(`${name} criada.`)
        setNewBank("")
        setNewNickname("")
        setNewOpeningStr("")
        setIsFormalIncome(false)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
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
                <SelectItem value="ticket">Vale-benefício</SelectItem>
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

        {/* Checkbox de rendimento formal — em linha separada pra não
            poluir o grid principal. ticket auto-marca; outros tipos
            o user decide. Útil pra DRE separar receita formal vs informal
            e pra relatórios "% do patrimônio em renda formal". */}
        <label className="flex cursor-pointer items-center gap-2 pt-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={newType === "ticket" ? true : isFormalIncome}
            disabled={newType === "ticket"}
            onChange={(e) => setIsFormalIncome(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-strong"
          />
          <span>
            <strong className="text-strong">Rendimento formal</strong> — saldo
            veio de salário CLT, vale-benefício, premiação ou restituição IR.
            {newType === "ticket" && (
              <span className="ml-1 text-[10px] uppercase tracking-wider">
                · auto pra Vale-benefício
              </span>
            )}
          </span>
        </label>
      </CardContent>
    </Card>
  )
}
