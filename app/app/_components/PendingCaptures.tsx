"use client"

import { useState, useTransition } from "react"
import { AlertCircle, ArrowDown, ArrowUp, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AccountType } from "@/lib/types"
import {
  resolvePendingCaptureAction,
  discardPendingCaptureAction,
} from "../actions"

interface PendingCapture {
  id: string
  channel: string
  raw_input: string | null
  created_at: string
  parsed: {
    amountCents: number
    type: "income" | "expense"
    categoryName: string
    subcategoryName: string | null
    merchant: string | null
    occurredOn: string
  }
}

interface Props {
  captures: PendingCapture[]
  accounts: { id: string; name: string; type: AccountType }[]
}

export function PendingCaptures({ captures, accounts }: Props) {
  if (captures.length === 0) return null

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-strong">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          Pendentes · escolha a conta
        </h2>
        <p className="text-xs text-muted">
          Você não disse de qual conta — atribua uma pra entrar no saldo.
        </p>
      </div>
      <ul className="space-y-2">
        {captures.map((c) => (
          <PendingRow key={c.id} capture={c} accounts={accounts} />
        ))}
      </ul>
    </div>
  )
}

function PendingRow({
  capture,
  accounts,
}: {
  capture: PendingCapture
  accounts: { id: string; name: string; type: AccountType }[]
}) {
  // FGTS, ações e cripto não fazem sentido como fonte pra despesas comuns;
  // mantemos só corrente, poupança, dinheiro/carteira e renda fixa. Cartões
  // aparecem num grupo próprio.
  const creditAccounts = accounts.filter((a) => a.type === "credit")
  const otherAccounts = accounts.filter(
    (a) =>
      a.type === "checking" ||
      a.type === "cash" ||
      a.type === "wallet" ||
      a.type === "savings" ||
      a.type === "poupanca",
  )
  const [accountId, setAccountId] = useState<string>("")
  const [pending, start] = useTransition()
  const { parsed } = capture
  const isIncome = parsed.type === "income"

  function save() {
    if (!accountId) {
      toast.error("Escolha uma conta.")
      return
    }
    start(async () => {
      try {
        await resolvePendingCaptureAction({
          captureId: capture.id,
          accountId,
        })
        toast.success("Transação registrada.")
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  function discard() {
    if (!confirm("Descartar essa captura?")) return
    start(async () => {
      try {
        await discardPendingCaptureAction(capture.id)
        toast.success("Descartada.")
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <li className="space-y-2 rounded-xl border border-border bg-canvas p-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            isIncome ? "bg-income/10" : "bg-expense/10"
          }`}
        >
          {isIncome ? (
            <ArrowUp className="h-3.5 w-3.5 text-income" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-expense" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-strong">
            {parsed.merchant ?? parsed.categoryName}
          </p>
          <p className="truncate text-xs text-muted">
            {parsed.categoryName}
            {parsed.subcategoryName ? ` · ${parsed.subcategoryName}` : ""} ·{" "}
            {formatPtBrDateShort(parsed.occurredOn)}
          </p>
        </div>
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            isIncome ? "text-income" : "text-expense"
          }`}
        >
          {isIncome ? "+" : "−"} {formatBRL(parsed.amountCents)}
        </p>
      </div>
      {capture.raw_input && (
        <p className="rounded-lg bg-subtle px-2.5 py-1.5 text-xs italic text-body">
          &ldquo;{capture.raw_input}&rdquo;
        </p>
      )}
      <div className="flex items-center gap-2">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="h-9 flex-1 text-xs">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {otherAccounts.length > 0 && (
              <SelectGroup>
                <SelectLabel>Contas</SelectLabel>
                {otherAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {creditAccounts.length > 0 && (
              <SelectGroup>
                <SelectLabel>Cartões de crédito</SelectLabel>
                {creditAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={save}
          disabled={!accountId || pending}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          Salvar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={discard}
          disabled={pending}
          className="text-muted hover:text-expense"
          title="Descartar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </li>
  )
}
