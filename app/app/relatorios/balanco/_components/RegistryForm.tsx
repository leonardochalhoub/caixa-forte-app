"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { toast } from "@/components/ui/toast"
import { REGISTRY_KINDS } from "@/lib/balanco/registry-helpers"
import { parseBRLToCents } from "@/lib/money"
import { RegistryFormFields } from "./RegistryFormFields"
import {
  RegistrySuggestion,
  type RegistrySuggestionApply,
} from "./RegistrySuggestion"

type CreateRegistryResponse =
  | { ok: true; id: string }
  | { ok: false; error: string }

export function AddRegistryButton({ period }: { period: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kindIdx, setKindIdx] = useState(0)
  const kind = REGISTRY_KINDS[kindIdx]!

  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [debitSection, setDebitSection] = useState<string>(kind.debitDefault)
  const [debitLabel, setDebitLabel] = useState("")
  const [creditSection, setCreditSection] = useState<string>(kind.creditDefault)
  const [creditLabel, setCreditLabel] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()

  function selectKind(i: number) {
    setKindIdx(i)
    const k = REGISTRY_KINDS[i]!
    setDebitSection(k.debitDefault)
    setCreditSection(k.creditDefault)
  }

  function applySuggestion(s: RegistrySuggestionApply) {
    setDescription(s.description)
    setDebitSection(s.debitSection)
    setDebitLabel(s.debitLabel)
    setCreditSection(s.creditSection)
    setCreditLabel(s.creditLabel)
    if (s.amount !== undefined) setAmount(s.amount)
    if (s.note !== undefined) setNote(s.note)
    if (s.kindIdx !== undefined) setKindIdx(s.kindIdx)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents == null || cents <= 0) {
      toast.error("Valor inválido.")
      return
    }
    start(async () => {
      try {
        const res = await fetch("/api/balance-registry/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            period,
            kind: kind.key,
            description: description.trim(),
            amountCents: cents,
            debitSection,
            debitLabel: debitLabel.trim(),
            creditSection,
            creditLabel: creditLabel.trim(),
            note: note.trim() || null,
          }),
        })
        const r = (await res.json().catch(() => null)) as
          | CreateRegistryResponse
          | null
        if (!r) {
          toast.error(`Falha: resposta inválida (HTTP ${res.status}).`)
          return
        }
        if (!r.ok) {
          toast.error(r.error)
          return
        }
        toast.success("Registro criado.")
        setDescription("")
        setAmount("")
        setDebitLabel("")
        setCreditLabel("")
        setNote("")
        setOpen(false)
        router.refresh()
      } catch (err) {
        toast.error(`Falha: ${(err as Error).message}`)
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar Registro
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo registro contábil</DialogTitle>
            <DialogDescription>
              Partida dobrada: o valor que entra em uma linha sai de outra.
              Descreva com IA ou escolha o tipo manualmente.
            </DialogDescription>
          </DialogHeader>

          <RegistrySuggestion onApply={applySuggestion} />

          <form onSubmit={submit} className="space-y-3">
            <RegistryFormFields
              kindIdx={kindIdx}
              onKindChange={selectKind}
              description={description}
              onDescriptionChange={setDescription}
              amount={amount}
              onAmountChange={setAmount}
              debitSection={debitSection}
              onDebitSectionChange={setDebitSection}
              debitLabel={debitLabel}
              onDebitLabelChange={setDebitLabel}
              creditSection={creditSection}
              onCreditSectionChange={setCreditSection}
              creditLabel={creditLabel}
              onCreditLabelChange={setCreditLabel}
              note={note}
              onNoteChange={setNote}
            />

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
                {pending ? "Registrando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
