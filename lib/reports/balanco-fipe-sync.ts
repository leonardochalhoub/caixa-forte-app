// Auto-sync FIPE pro Balanço: ao abrir um período mensal, propaga
// ajustes FIPE existentes em outros períodos pra esse, atualizando
// o preço com a cotação atual da FIPE quando possível. Idempotente.
//
// Extraído do balanco/page.tsx (era ~85L inline do god-file).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { fetchFipePrice, type FipeMetadata } from "@/lib/fipe"

type AdjRow = {
  id: string
  period: string
  line_key: string
  label: string
  amount_cents: number
  note: string | null
  metadata?: FipeMetadata | null
}

type FipeAdj = {
  id: string
  period: string
  line_key: string
  label: string
  amount_cents: number
  metadata: FipeMetadata
}

type Client = SupabaseClient<Database>

// Lê os ajustes FIPE existentes em todos os períodos do user, e pra
// cada (fipe_code, year_id) que NÃO esteja no período atual, herda
// o último valor conhecido (com fetch da cotação atual quando rola).
// Retorna os novos ajustes inseridos pra somar à lista do caller.
export async function autoSyncFipeForPeriod(
  supabase: Client,
  userId: string,
  periodStr: string,
  currentAdjustments: AdjRow[],
): Promise<AdjRow[]> {
  const { data: allFipeRaw } = await supabase
    .from("balance_adjustments")
    .select("id, period, line_key, label, amount_cents, metadata")
    .eq("user_id", userId)
    .eq("metadata->>source", "fipe")

  const allFipe = (allFipeRaw ?? []) as unknown as FipeAdj[]

  // Pra cada (fipe_code, year_id), verifica se já existe entrada no periodStr
  const existingInPeriod = new Set(
    currentAdjustments
      .map((a) => {
        const m = a.metadata
        return m?.source === "fipe" ? `${m.fipe_code}::${m.year_id}` : null
      })
      .filter((x): x is string => x != null),
  )

  // Pega o template mais recente por (fipe_code, year_id) que ainda não
  // foi materializado no periodStr corrente.
  const templatesByKey = new Map<string, FipeAdj>()
  for (const a of allFipe) {
    const k = `${a.metadata.fipe_code}::${a.metadata.year_id}`
    if (existingInPeriod.has(k)) continue
    const prev = templatesByKey.get(k)
    if (!prev || a.period > prev.period) templatesByKey.set(k, a)
  }

  if (templatesByKey.size === 0) return []

  // Busca preços em paralelo (best-effort: falha cai no preço do
  // último período como fallback).
  const newInserts: Array<{
    user_id: string
    period: string
    line_key: string
    label: string
    amount_cents: number
    note: string
    metadata: FipeMetadata
  }> = []
  await Promise.all(
    [...templatesByKey.values()].map(async (t) => {
      const [section] = t.line_key.split("::")
      let priceCents = t.amount_cents
      let note = `Valor herdado do último período (${t.period.replace("mensal:", "")}) — FIPE indisponível ou sem dados pro mês.`
      let refMonth = t.metadata.last_reference_month
      try {
        const price = await fetchFipePrice(t.metadata)
        priceCents = price.priceCents
        note = `FIPE ${price.referenceMonth} · código ${t.metadata.fipe_code} · auto-atualizado ao abrir o período`
        refMonth = price.referenceMonth
      } catch {
        // Fallback: mantém valor do último período conhecido
      }
      newInserts.push({
        user_id: userId,
        period: periodStr,
        line_key: `${section}::custom:${Date.now()}:fipe-${t.metadata.fipe_code}`,
        label: t.label,
        amount_cents: priceCents,
        note,
        metadata: {
          ...t.metadata,
          last_checked_at: new Date().toISOString(),
          last_reference_month: refMonth,
        },
      })
    }),
  )

  if (newInserts.length === 0) return []

  const { data: inserted } = await supabase
    .from("balance_adjustments")
    .insert(newInserts as never)
    .select("id, period, line_key, label, amount_cents, note")
  return (inserted ?? []) as AdjRow[]
}
