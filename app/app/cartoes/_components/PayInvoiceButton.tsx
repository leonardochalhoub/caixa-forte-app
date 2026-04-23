"use client"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { payInvoiceAction } from "../actions"

export function PayInvoiceButton({
  cardId,
  cardName,
  invoiceLabel,
  invoiceKey,
  amountCents,
  checkingAccounts,
}: {
  cardId: string
  cardName: string
  invoiceLabel: string
  invoiceKey: string
  amountCents: number
  checkingAccounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [sourceId, setSourceId] = useState<string>(
    checkingAccounts[0]?.id ?? "",
  )
  const [pending, start] = useTransition()

  function confirm() {
    if (!sourceId) {
      toast.error("Escolha a conta de onde sai o pagamento.")
      return
    }
    start(async () => {
      try {
        await payInvoiceAction({
          cardId,
          sourceAccountId: sourceId,
          amountCents,
          invoiceLabel: `${cardName} · ${invoiceLabel}`,
        })
        toast.success("Fatura paga.")
        setOpen(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Pagar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar fatura {invoiceLabel}</DialogTitle>
            <DialogDescription>
              Valor a pagar:{" "}
              <span className="font-mono font-semibold tabular-nums text-strong">
                {formatBRL(amountCents)}
              </span>
              . Vai criar uma transferência entre a conta escolhida e {cardName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs text-muted">Debitar de:</label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a conta" />
              </SelectTrigger>
              <SelectContent>
                {checkingAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={pending || !sourceId}>
              {pending ? "Pagando…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
