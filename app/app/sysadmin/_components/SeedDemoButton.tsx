"use client"

import { Sparkles } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

type LogRow = { step: string; detail: string; ok: boolean }

export function SeedDemoButton() {
  const [pending, setPending] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])

  async function run() {
    if (pending) return
    setPending(true)
    setLogs([])
    try {
      const res = await fetch("/api/admin/seed-demo", { method: "POST" })
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
      toast.success(`Larissa recriada. userId: ${r.userId?.slice(0, 8)}…`)
    } catch (err) {
      toast.error(`Seed falhou: ${(err as Error).message}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={run}
        disabled={pending}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Semeando Larissa (pode levar ~2 min)…" : "Re-seed Larissa"}
      </Button>
      {logs.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-border bg-subtle p-2 text-[10px] font-mono">
          {logs.map((l, i) => (
            <li
              key={i}
              className={l.ok ? "text-body" : "text-expense"}
            >
              [{l.step}] {l.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
