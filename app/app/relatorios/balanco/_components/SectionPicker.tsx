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
  type SectionOption,
  REGISTRY_SECTIONS,
} from "@/lib/balanco/registry-helpers"

type Variant = "debit" | "credit"

const VARIANT_STYLES: Record<
  Variant,
  { container: string; label: string; title: string }
> = {
  debit: {
    container: "border-income/30 bg-income/5",
    label: "text-income",
    title: "Débito (entra na linha)",
  },
  credit: {
    container: "border-expense/30 bg-expense/5",
    label: "text-expense",
    title: "Crédito (sai da linha)",
  },
}

export function SectionPicker({
  variant,
  section,
  onSectionChange,
  label,
  onLabelChange,
  labelPlaceholder,
  sections = REGISTRY_SECTIONS,
}: {
  variant: Variant
  section: string
  onSectionChange: (v: string) => void
  label: string
  onLabelChange: (v: string) => void
  labelPlaceholder: string
  sections?: readonly SectionOption[]
}) {
  const styles = VARIANT_STYLES[variant]
  return (
    <div
      className={`space-y-1.5 rounded-lg border p-3 ${styles.container}`}
    >
      <Label
        className={`text-[10px] uppercase tracking-wider ${styles.label}`}
      >
        {styles.title}
      </Label>
      <Select value={section} onValueChange={onSectionChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sections.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={labelPlaceholder}
        required
      />
    </div>
  )
}
