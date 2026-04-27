"use client"

import { useState, useTransition } from "react"
import { Undo2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { voidInvoicePaymentAction } from "../actions"

// Botão pequeno mostrado dentro de um lump-sum entry com badge "fatura paga"
// — permite desfazer o par transfer criado pelo botão Pagar.
//
// Importante: o RPC void_transfer apaga os 2 lados (expense na corrente +
// income no cartão). Os charges que ficaram paid_at=now() pelo pay_invoice
// permanecem assim — se o user quiser desfazer também, edita cada um.
// Pragmaticamente isso quase nunca é necessário: a fatura volta a
// aparecer como em aberto e novos pagamentos limpam tudo.
export function VoidInvoicePaymentButton({
  txId,
  amountCents,
  invoiceLabel,
}: {
  txId: string
  amountCents: number
  invoiceLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function confirm() {
    start(async () => {
      try {
        const r = await voidInvoicePaymentAction({ txId })
        toast.success(
          r.orphan
            ? "Pagamento removido (sem par associado)."
            : `Pagamento desfeito (${r.deletedIds.length} tx removidas).`,
        )
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
        className="shrink-0 text-[10px] uppercase tracking-wider text-muted hover:text-expense"
        title="Desfazer este pagamento"
      >
        <Undo2 className="h-3 w-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desfazer pagamento da fatura?</DialogTitle>
            <DialogDescription>
              Vai apagar a saída de{" "}
              <span className="font-mono font-semibold text-strong">
                {formatBRL(amountCents)}
              </span>{" "}
              da conta corrente e a entrada equivalente no cartão (par
              de transferência criado quando você clicou em Pagar). A
              fatura{" "}
              <span className="text-strong">{invoiceLabel}</span> volta
              a aparecer como em aberto.
              <br />
              <br />
              Compras individuais que ficaram marcadas como pagas
              continuam pagas — se quiser desmarcar, edite uma a uma.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {pending ? "Desfazendo…" : "Desfazer pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
