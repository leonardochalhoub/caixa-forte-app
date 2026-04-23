"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function DREPeriodSelector({
  current,
  months,
  years,
}: {
  current: string
  months: { value: string; label: string }[]
  years: { value: string; label: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(value: string) {
    const q = new URLSearchParams(params?.toString() ?? "")
    q.set("periodo", value)
    router.push(`?${q.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted">
        Período:
      </span>
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger className="min-w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Mensal</SelectLabel>
            {months.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Anual</SelectLabel>
            {years.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
