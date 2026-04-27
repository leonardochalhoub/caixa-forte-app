"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type RegistryKind,
  REGISTRY_KINDS,
} from "@/lib/balanco/registry-helpers"
import { SectionPicker } from "./SectionPicker"

export function RegistryFormFields({
  kindIdx,
  onKindChange,
  description,
  onDescriptionChange,
  amount,
  onAmountChange,
  debitSection,
  onDebitSectionChange,
  debitLabel,
  onDebitLabelChange,
  creditSection,
  onCreditSectionChange,
  creditLabel,
  onCreditLabelChange,
  note,
  onNoteChange,
  kinds = REGISTRY_KINDS,
}: {
  kindIdx: number
  onKindChange: (i: number) => void
  description: string
  onDescriptionChange: (v: string) => void
  amount: string
  onAmountChange: (v: string) => void
  debitSection: string
  onDebitSectionChange: (v: string) => void
  debitLabel: string
  onDebitLabelChange: (v: string) => void
  creditSection: string
  onCreditSectionChange: (v: string) => void
  creditLabel: string
  onCreditLabelChange: (v: string) => void
  note: string
  onNoteChange: (v: string) => void
  kinds?: readonly RegistryKind[]
}) {
  const kind = kinds[kindIdx]!
  return (
    <>
      {/* Linha 1: Tipo + Descrição + Valor */}
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_140px]">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select
            value={String(kindIdx)}
            onValueChange={(v) => onKindChange(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((k, i) => (
                <SelectItem key={k.key} value={String(i)}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-desc">Descrição</Label>
          <Input
            id="reg-desc"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Ex: Pagamento pensão alimentícia"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-amount">Valor (R$)</Label>
          <Input
            id="reg-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0,00"
            required
          />
        </div>
      </div>

      <p className="text-[10px] italic text-muted">{kind.hint}</p>

      {/* 2 colunas em desktop, empilha em mobile */}
      <div className="grid gap-3 md:grid-cols-2">
        <SectionPicker
          variant="debit"
          section={debitSection}
          onSectionChange={onDebitSectionChange}
          label={debitLabel}
          onLabelChange={onDebitLabelChange}
          labelPlaceholder={kind.debitPlaceholder}
        />
        <SectionPicker
          variant="credit"
          section={creditSection}
          onSectionChange={onCreditSectionChange}
          label={creditLabel}
          onLabelChange={onCreditLabelChange}
          labelPlaceholder={kind.creditPlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-note">Observação (opcional)</Label>
        <textarea
          id="reg-note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          className="flex min-h-[50px] w-full rounded-md border border-border bg-subtle px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
          placeholder="Nota explicativa, fonte, contexto"
        />
      </div>
    </>
  )
}
