"use client"

import { Plus, Trash2, X, Pencil } from "lucide-react"
import { useState, useTransition } from "react"
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
import { toast } from "@/components/ui/toast"
import { parseBRLToCents } from "@/lib/money"
import {
  createBalanceAdjustmentAction,
  deleteBalanceAdjustmentAction,
  deleteBalanceRegistryAction,
  updateBalanceAdjustmentAction,
} from "../actions"

export type Adjustment = {
  id: string
  label: string
  amount_cents: number
  note: string | null
  // Se vier de FIPE ou outra fonte automática, bloqueia edit/delete
  // — o valor é gerenciado pelo auto-sync, editar à mão seria perdido
  // na próxima renderização.
  readonly_source?: "fipe" | null
  // Se o adjustment é parte de um par registry (partida dobrada —
  // ex: pensão tem debit em PL + credit em ativo), guarda o registry_id
  // pra deletar o PAR completo via deleteBalanceRegistryAction.
  // Apagar 1 lado só deixa o outro órfão e quebra o balanço.
  registry_id?: string | null
}

export function AddLineButton({
  period,
  section,
  hint,
}: {
  period: string
  section: string
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents == null || cents === 0) {
      toast.error("Valor inválido.")
      return
    }
    if (!label.trim()) {
      toast.error("Descrição obrigatória.")
      return
    }
    start(async () => {
      try {
        await createBalanceAdjustmentAction({
          period,
          section,
          label: label.trim(),
          amountCents: cents,
          note: note.trim() || null,
        })
        toast.success("Linha adicionada.")
        setLabel("")
        setAmount("")
        setNote("")
        setOpen(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted hover:text-strong"
      >
        <Plus className="h-3 w-3" />
        adicionar linha
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar linha ao balanço</DialogTitle>
            <DialogDescription>
              {hint ??
                "Linha custom pro período selecionado. Pode ser imobilizado, empréstimo, investimento fora do app, etc."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bal-label">Descrição</Label>
              <Input
                id="bal-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Apartamento em SP · Empréstimo família"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bal-amount">Valor (R$)</Label>
              <Input
                id="bal-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bal-note">Observação (opcional)</Label>
              <textarea
                id="bal-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota explicativa — ex: avaliação, fonte, etc."
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-border bg-subtle px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adicionando…" : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AdjustmentActions({ adjustment }: { adjustment: Adjustment }) {
  const [editOpen, setEditOpen] = useState(false)
  const [label, setLabel] = useState(adjustment.label)
  const [amount, setAmount] = useState(
    (adjustment.amount_cents / 100).toFixed(2).replace(".", ","),
  )
  const [note, setNote] = useState(adjustment.note ?? "")
  const [pending, start] = useTransition()

  function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents == null) {
      toast.error("Valor inválido.")
      return
    }
    start(async () => {
      try {
        await updateBalanceAdjustmentAction({
          id: adjustment.id,
          label: label.trim(),
          amountCents: cents,
          note: note.trim() || null,
        })
        toast.success("Atualizado.")
        setEditOpen(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  function remove() {
    const isRegistry = !!adjustment.registry_id
    const msg = isRegistry
      ? `Remover "${adjustment.label}" do balanço? Vai apagar AMBOS os lados do registro contábil (débito + crédito).`
      : `Remover "${adjustment.label}" do balanço?`
    if (!confirm(msg)) return
    start(async () => {
      try {
        if (isRegistry && adjustment.registry_id) {
          // Pensão e similares são partida dobrada — deleta o par
          // inteiro via deleteBalanceRegistryAction (apaga registry +
          // 2 adjustments). Apagar só 1 lado deixa o outro órfão.
          await deleteBalanceRegistryAction(adjustment.registry_id)
        } else {
          await deleteBalanceAdjustmentAction(adjustment.id)
        }
        toast.success("Removido.")
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-muted hover:text-strong"
          title="Editar"
          disabled={pending}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={remove}
          className="text-muted hover:text-expense"
          title="Remover"
          disabled={pending}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </span>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar linha</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-label">Descrição</Label>
              <Input
                id="ed-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-amount">Valor (R$)</Label>
              <Input
                id="ed-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-note">Observação</Label>
              <textarea
                id="ed-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-border bg-subtle px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditOpen(false)}
                disabled={pending}
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
