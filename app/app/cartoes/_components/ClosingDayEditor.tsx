"use client"

import { useState, useTransition } from "react"
import { Pencil, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { updateClosingDayAction } from "../actions"

export function ClosingDayEditor({
  cardId,
  closingDay,
}: {
  cardId: string
  closingDay: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(closingDay ?? 20))
  const [pending, start] = useTransition()

  function save() {
    const day = Number(value)
    if (!Number.isFinite(day) || day < 1 || day > 28) {
      toast.error("Dia inválido (1–28).")
      return
    }
    if (day === closingDay) {
      setEditing(false)
      return
    }
    start(async () => {
      try {
        await updateClosingDayAction({ cardId, closingDay: day })
        toast.success(`Fechamento agora é dia ${day}.`)
        setEditing(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  function cancel() {
    setValue(String(closingDay ?? 20))
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted hover:text-strong"
        title="Mudar dia de fechamento da fatura"
      >
        Fecha dia <span className="font-mono tabular-nums">{closingDay ?? 20}</span>
        <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted">
        Fecha dia
      </span>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={28}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            save()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        }}
        autoFocus
        disabled={pending}
        className="h-6 w-14 px-1.5 text-center font-mono text-xs tabular-nums"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="text-income hover:opacity-80 disabled:opacity-50"
        aria-label="Salvar"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="text-muted hover:text-expense"
        aria-label="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
