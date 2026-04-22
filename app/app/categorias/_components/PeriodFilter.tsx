"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PT_MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

function fmtMonthYear(ym: string): string {
  const [y, m] = ym.split("-")
  if (!y || !m) return ym
  const monthIdx = parseInt(m, 10) - 1
  return `${PT_MONTHS[monthIdx] ?? m}/${y.slice(2)}`
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function defaultCurrentMonth(): string {
  return monthKey(new Date())
}

function monthsAgo(n: number): string {
  const now = new Date()
  return monthKey(new Date(now.getFullYear(), now.getMonth() - n, 1))
}

// Translate the preset key to the [from, to] month range it implicitly
// covers, so the Intervalo inputs reflect the active preset instead of
// drifting to an unrelated default value.
function rangeForPreset(preset: string): { from: string; to: string } {
  const now = defaultCurrentMonth()
  if (preset === "6m") return { from: monthsAgo(5), to: now }
  if (preset === "12m") return { from: monthsAgo(11), to: now }
  if (preset === "all") return { from: "1970-01", to: now }
  return { from: now, to: now }
}

export function PeriodFilter({
  current,
  from,
  to,
  rangeLabel,
}: {
  current: string
  from: string | null
  to: string | null
  rangeLabel: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const presetRange = rangeForPreset(current)
  const [rangeFrom, setRangeFrom] = useState(from ?? presetRange.from)
  const [rangeTo, setRangeTo] = useState(to ?? presetRange.to)

  // Keep the Intervalo inputs synced with whatever the page is currently
  // filtered by. When a preset is active the server doesn't pass from/to,
  // so we derive the matching range and mirror it in the month inputs.
  useEffect(() => {
    if (from && to) {
      setRangeFrom(from)
      setRangeTo(to)
    } else {
      const derived = rangeForPreset(current)
      setRangeFrom(derived.from)
      setRangeTo(derived.to)
    }
  }, [from, to, current])

  function setPreset(period: string) {
    const next = new URLSearchParams(params?.toString() ?? "")
    next.delete("from")
    next.delete("to")
    if (period === "current") next.delete("period")
    else next.set("period", period)
    start(() => router.replace(`/app/categorias?${next.toString()}`))
  }

  function applyRange(f: string, t: string) {
    if (!/^\d{4}-\d{2}$/.test(f) || !/^\d{4}-\d{2}$/.test(t)) return
    const a = f <= t ? f : t
    const b = f <= t ? t : f
    const next = new URLSearchParams(params?.toString() ?? "")
    next.delete("period")
    next.set("from", a)
    next.set("to", b)
    start(() => router.replace(`/app/categorias?${next.toString()}`))
  }

  const isCustomRange = current === "range"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodButton
          label="Este mês"
          active={current === "current"}
          onClick={() => setPreset("current")}
        />
        <PeriodButton label="6 meses" active={current === "6m"} onClick={() => setPreset("6m")} />
        <PeriodButton
          label="12 meses"
          active={current === "12m"}
          onClick={() => setPreset("12m")}
        />
        <PeriodButton label="Tudo" active={current === "all"} onClick={() => setPreset("all")} />
        <span className={`ml-auto text-xs text-muted ${pending ? "animate-pulse" : ""}`}>
          {rangeLabel}
        </span>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border p-2",
          isCustomRange
            ? "border-strong bg-subtle"
            : "border-border bg-subtle/60",
        )}
      >
        <span className="flex items-center gap-1.5 px-1 text-xs text-muted">
          <Calendar className="h-3.5 w-3.5" />
          Intervalo
        </span>

        <MonthInput
          value={rangeFrom}
          onChange={(v) => {
            setRangeFrom(v)
            applyRange(v, rangeTo)
          }}
          label="De"
        />

        <span className="text-xs text-muted">até</span>

        <MonthInput
          value={rangeTo}
          onChange={(v) => {
            setRangeTo(v)
            applyRange(rangeFrom, v)
          }}
          label="Até"
        />

        {isCustomRange && (
          <span className="ml-auto font-mono text-xs tabular-nums text-strong">
            {fmtMonthYear(rangeFrom)} → {fmtMonthYear(rangeTo)}
          </span>
        )}
      </div>
    </div>
  )
}

function PeriodButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-xs",
        active
          ? "bg-strong text-canvas font-medium hover:bg-strong"
          : "text-body hover:bg-subtle hover:text-strong",
      )}
    >
      {label}
    </Button>
  )
}

function MonthInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-border bg-canvas px-2 py-1 text-sm">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <input
        type="month"
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="bg-transparent font-mono text-xs tabular-nums text-strong focus:outline-none"
      />
    </label>
  )
}
