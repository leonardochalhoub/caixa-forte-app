"use client"

import { Sparkles } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"

type LogRow = { step: string; detail: string; ok: boolean }

type RangeKey = "full" | "2025" | "2026" | "q1-2026" | "last-12m"

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hint: string }> = [
  {
    key: "full",
    label: "Completo (2025 + 2026)",
    hint: "24 meses · agendadas no futuro · instantâneo (sem IA)",
  },
  {
    key: "2025",
    label: "Ano 2025 inteiro",
    hint: "12 meses · instantâneo",
  },
  {
    key: "2026",
    label: "Ano 2026 inteiro",
    hint: "12 meses · futuro como agendado · instantâneo",
  },
  {
    key: "q1-2026",
    label: "Só primeiro trimestre 2026",
    hint: "3 meses · instantâneo",
  },
  {
    key: "last-12m",
    label: "Últimos 12 meses",
    hint: "12 meses · instantâneo",
  },
]

export function SeedDemoButton() {
  const [range, setRange] = useState<RangeKey>("full")
  const [pending, setPending] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])

  async function run() {
    if (pending) return
    setPending(true)
    setLogs([])
    try {
      const res = await fetch("/api/admin/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range }),
      })
      const r = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; logs?: LogRow[]; userId?: string }
        | null
      if (!r) {
        toast.error(`Seed falhou: HTTP ${res.status}`)
        return
      }
      if (r.logs) setLogs(r.logs)
      if (!r.ok) {
        toast.error(r.error ?? "Seed falhou")
        return
      }
      toast.success(`Larissa recriada (userId ${r.userId?.slice(0, 8)}…)`)
    } catch (err) {
      toast.error(`Seed falhou: ${(err as Error).message}`)
    } finally {
      setPending(false)
    }
  }

  const selected = RANGE_OPTIONS.find((o) => o.key === range)!

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="seed-range" className="text-[10px] uppercase tracking-wider text-muted">
            Período a gerar
          </Label>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger id="seed-range" className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={run}
          disabled={pending}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {pending ? "Semeando…" : "Re-seed Larissa"}
        </Button>
      </div>
      <p className="text-[11px] italic text-muted">{selected.hint}</p>
      {logs.length > 0 && (
        <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border bg-subtle p-2 text-[10px] font-mono">
          {logs.map((l, i) => (
            <li key={i} className={l.ok ? "text-body" : "text-expense"}>
              [{l.step}] {l.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
