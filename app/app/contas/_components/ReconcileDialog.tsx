"use client"

import { useState, useTransition } from "react"
import { Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { toast } from "@/components/ui/toast"
import { formatBRL, parseBRLToCents } from "@/lib/money"
import { reconcileAccountBalance } from "../actions"

export function ReconcileDialog({
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
