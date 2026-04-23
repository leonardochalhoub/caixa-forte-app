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

export function PeriodSelector({
  current,
  options,
  fullHistoryLabel,
}: {
  current: string
  options: { value: string; label: string }[]
  fullHistoryLabel: string
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
      <span className="text-xs uppercase tracking-wider text-muted">Período:</span>
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger className="min-w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Mês</SelectLabel>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Geral</SelectLabel>
            <SelectItem value="tudo">{fullHistoryLabel}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
