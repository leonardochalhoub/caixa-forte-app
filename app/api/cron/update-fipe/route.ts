import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { fetchFipePrice, type FipeMetadata } from "@/lib/fipe"

// Cron mensal: busca todas balance_adjustments com metadata.source=fipe
// e GARANTE que existe uma entrada pro mês corrente com o valor atual
// da tabela FIPE. Se a entrada do mês atual já existir, atualiza
// amount_cents (idempotente). Se não existir, cria.

export const dynamic = "force-dynamic"
export const maxDuration = 60

function currentMonthPeriod(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `mensal:${y}-${m}`
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "missing env" }, { status: 500 })
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  type AdjRow = {
    id: string
    user_id: string
    period: string
    line_key: string
    label: string
    amount_cents: number
    metadata: unknown
  }
  const { data: adjustmentsRaw, error: fetchErr } = await sb
    .from("balance_adjustments")
    .select("id, user_id, period, line_key, label, amount_cents, metadata")
    .eq("metadata->>source", "fipe")
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  const adjustments = (adjustmentsRaw ?? []) as AdjRow[]

  const targetPeriod = currentMonthPeriod()
  // Pra cada (user_id, line_key base) procuramos a linha mais recente
  // como "modelo" e copiamos pra o mês atual com preço novo. line_key
  // aqui é único por ajuste, mas duas linhas do mesmo carro em meses
  // diferentes compartilham mesmos model_id/year_id/fipe_code no meta.
  const seenByUserFipe = new Map<string, AdjRow>()
  for (const a of adjustments) {
    const m = a.metadata as FipeMetadata
    if (!m || m.source !== "fipe") continue
    const k = `${a.user_id}::${m.fipe_code}::${m.year_id}`
    const prev = seenByUserFipe.get(k)
    // usa o mais recente como template
    if (!prev || a.period > prev.period) seenByUserFipe.set(k, a)
  }

  const results: Array<{
    user_id: string
    fipe_code: string
    label: string
    action: "updated" | "created" | "skipped" | "error"
    price?: string
    error?: string
  }> = []

  for (const template of seenByUserFipe.values()) {
    const meta = template.metadata as FipeMetadata
    try {
      const priceResult = await fetchFipePrice(meta)
      const newMeta: FipeMetadata = {
        ...meta,
        last_checked_at: new Date().toISOString(),
        last_reference_month: priceResult.referenceMonth,
      }

      // Existe linha pra esse carro/período?
      const { data: existing } = await sb
        .from("balance_adjustments")
        .select("id, amount_cents")
        .eq("user_id", template.user_id)
        .eq("period", targetPeriod)
        .eq("metadata->>fipe_code", meta.fipe_code)
        .eq("metadata->>year_id", meta.year_id)
        .maybeSingle()

      if (existing) {
        await sb
          .from("balance_adjustments")
          .update({
            amount_cents: priceResult.priceCents,
            label: template.label,
            metadata: newMeta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
        results.push({
          user_id: template.user_id,
          fipe_code: meta.fipe_code,
          label: template.label,
          action: "updated",
          price: priceResult.price,
        })
      } else {
        // Cria nova entrada — mantém a parte seção do line_key, renova o sufixo
        const [section] = template.line_key.split("::")
        const newLineKey = `${section}::custom:${Date.now()}:fipe-${meta.fipe_code}`
        await sb.from("balance_adjustments").insert({
          user_id: template.user_id,
          period: targetPeriod,
          line_key: newLineKey,
          label: template.label,
          amount_cents: priceResult.priceCents,
          note: `FIPE ${priceResult.referenceMonth} · código ${meta.fipe_code} · atualizado automaticamente`,
          metadata: newMeta,
        })
        results.push({
          user_id: template.user_id,
          fipe_code: meta.fipe_code,
          label: template.label,
          action: "created",
          price: priceResult.price,
        })
      }
    } catch (err) {
      results.push({
        user_id: template.user_id,
        fipe_code: meta.fipe_code,
        label: template.label,
        action: "error",
        error: (err as Error).message,
      })
    }
  }

  return NextResponse.json({
    targetPeriod,
    processed: results.length,
    results,
  })
}
