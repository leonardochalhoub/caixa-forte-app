"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { createCreditCardAction } from "../actions"

export function CardsManager({
  checkingAccounts,
}: {
  checkingAccounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [bank, setBank] = useState("")
  const [nickname, setNickname] = useState("")
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bank.trim()) return
    start(async () => {
      try {
        await createCreditCardAction({ bank, nickname: nickname || undefined })
        toast.success("Cartão criado.")
        setBank("")
        setNickname("")
        setOpen(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Novo cartão
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cartão de crédito</DialogTitle>
            <DialogDescription>
              Cada cartão é uma conta separada. As compras vão ficando na fatura do
              mês até você pagar.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-bank">Banco</Label>
              <Input
                id="card-bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="Ex: Nubank, Caixa, Itaú"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-nick">Apelido (opcional)</Label>
              <Input
                id="card-nick"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: Platinum, Infinite"
              />
            </div>
            {checkingAccounts.length === 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-body">
                Dica: crie antes uma Conta Corrente — você vai precisar dela pra
                pagar a fatura.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Criando…" : "Criar cartão"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
