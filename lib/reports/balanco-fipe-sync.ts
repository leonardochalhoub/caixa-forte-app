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

// Auto-sync de ajustes manuais recorrentes (não-FIPE).
// User reportou: ao abrir Balanço Anual, o financiamento do carro
// (passivo, source=null, slug "financ-nissan") sumia. autoSyncFipeForPeriod
// só cobria FIPE — ajustes manuais como financiamento, alugueis fixos,
// imóveis avaliados manualmente etc ficavam órfãos.
//
// Estratégia: line_key tem formato "section::custom:TIMESTAMP:slug-final".
// O slug-final identifica a "coisa" (financ-nissan, fipe-XXX, casa-praia
// etc). Pra cada (section, slug-final) que não está no period atual,
// copia o mais recente de outro period (mesmo valor, sem fetch externo).
//
// Identidade: `${section}::${slugFinal}` — ignora timestamp.
// Skip de :registry: (lançamentos contábeis de eventos pontuais como
// pensão paga em mês X — esses NÃO devem propagar).
export async function autoSyncCustomAdjustments(
  supabase: Client,
  userId: string,
  periodStr: string,
  currentAdjustments: AdjRow[],
): Promise<AdjRow[]> {
  const { data: allRaw } = await supabase
    .from("balance_adjustments")
    .select("id, period, line_key, label, amount_cents, note, metadata")
    .eq("user_id", userId)
    .neq("period", periodStr)

  const all = (allRaw ?? []) as AdjRow[]

  function identityOf(lineKey: string): string | null {
    // section::custom:TS:slug — só propaga `:custom:`, pula `:registry:`
    const parts = lineKey.split("::")
    if (parts.length < 2) return null
    const section = parts[0]
    const tail = parts[1]
    if (!tail || !tail.startsWith("custom:")) return null
    const slugFinal = tail.split(":").slice(2).join(":") // tudo após custom:TS:
    if (!slugFinal) return null
    return `${section}::${slugFinal}`
  }

  // Index do que JÁ existe no period atual.
  const existingInPeriod = new Set(
    currentAdjustments
      .map((a) => identityOf(a.line_key))
      .filter((x): x is string => x != null),
  )

  // Templates por identidade — pega o mais recente em outros periods.
  const templatesByIdentity = new Map<string, AdjRow>()
  for (const a of all) {
    const id = identityOf(a.line_key)
    if (!id) continue
    if (existingInPeriod.has(id)) continue
    // Skip FIPE — autoSyncFipeForPeriod já cuida dele com fetch de preço.
    if ((a.metadata as { source?: string } | null)?.source === "fipe") continue
    const prev = templatesByIdentity.get(id)
    if (!prev || a.period > prev.period) templatesByIdentity.set(id, a)
  }

  if (templatesByIdentity.size === 0) return []

  const newInserts = [...templatesByIdentity.values()].map((t) => {
    const id = identityOf(t.line_key)!
    const [section, slugFinal] = id.split("::")
    return {
      user_id: userId,
      period: periodStr,
      line_key: `${section}::custom:${Date.now()}:${slugFinal}`,
      label: t.label,
      amount_cents: t.amount_cents,
      note: `Valor herdado do período ${t.period.replace("mensal:", "").replace("anual:", "")} — auto-propagado ao abrir esse período. Edite se precisar atualizar.`,
      metadata: t.metadata ?? null,
    }
  })

  const { data: inserted } = await supabase
    .from("balance_adjustments")
    .insert(newInserts as never)
    .select("id, period, line_key, label, amount_cents, note, metadata")
  return (inserted ?? []) as AdjRow[]
}
