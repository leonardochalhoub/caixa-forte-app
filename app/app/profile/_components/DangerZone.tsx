"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { deleteAccountAction, type LifecycleEvent } from "../lifecycle"
import { formatIsoPtBr } from "@/lib/profile/format"

export function DangerZone({ events }: { events: LifecycleEvent[] }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function handleDelete() {
    start(async () => {
      try {
        await deleteAccountAction()
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <Card className="border-expense/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-expense">
          <AlertTriangle className="h-4 w-4" />
          Zona de perigo
        </CardTitle>
        <CardDescription>
          Desativar sua conta bloqueia o acesso imediatamente. Seus dados
          continuam guardados — se você voltar e entrar com o mesmo email e
          senha, a conta é reativada automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="destructive"
          onClick={() => setOpen(true)}
          className="gap-2"
          disabled={pending}
        >
          <Trash2 className="h-4 w-4" />
          Desativar minha conta
        </Button>

        {events.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
              Histórico
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {events.map((e) => {
                const Icon = e.event_type === "deleted" ? Trash2 : RotateCcw
                const color =
                  e.event_type === "deleted" ? "text-expense" : "text-income"
                const label =
                  e.event_type === "deleted" ? "Desativada" : "Reativada"
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className={`flex items-center gap-2 ${color}`}>
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                    <span className="font-mono tabular-nums text-muted">
                      {formatIsoPtBr(e.happened_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desativar conta</DialogTitle>
              <DialogDescription>
                Você perde o acesso agora. Seus dados (transações, contas,
                categorias, fotos) permanecem guardados. Se entrar de novo
                com o mesmo email e senha, a conta reativa sozinha.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={pending}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {pending ? "Desativando..." : "Confirmar desativação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
