"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Error boundary global pros relatórios. Server query falhando
// (Supabase down, timeout, RLS bug) renderizava blank page —
// agora vira mensagem com retry + link pra home.
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Best-effort log; não trava render.
    console.error("[reports] render error:", error)
  }, [error])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold text-strong">
        Não foi possível carregar este relatório
      </h2>
      <p className="max-w-md text-sm text-muted">
        Algo deu errado ao buscar os dados. Pode ser um problema temporário —
        tente novamente em alguns segundos.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] tracking-wider text-muted">
          ref: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={reset}>Tentar de novo</Button>
        <Button variant="outline" asChild>
          <Link href="/app">Voltar pra home</Link>
        </Button>
      </div>
    </div>
  )
}
