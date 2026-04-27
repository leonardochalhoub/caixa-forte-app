import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cron diário: pra cada user com transações, popula balance_snapshots
// com saldo total + breakdown por conta + por tipo. Idempotente via
// UNIQUE (user_id, snapshot_date) — re-execução no mesmo dia atualiza.
//
// Após Conselho v3, a lógica de cálculo migrou pras funções SQL
// `compute_per_account_balance` + `compute_per_account_type` (mig 0053).
// Esta route só orquestra: lista users → chama function → upsert.
//
// Conselho v3 (the-planner): infra de produto pra trends honestos.
// Sem snapshot, gráfico de "pra onde foi" é raso porque recalcula
// sobre estado atual.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "missing supabase env" }, { status: 500 })
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Today em São Paulo (timezone do app).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  // Lista usuários distintos com pelo menos uma conta ativa.
  const { data: usersWithAccts, error: e1 } = await sb
    .from("accounts")
    .select("user_id")
    .is("archived_at", null)
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 })
  }
  const userIds = Array.from(new Set((usersWithAccts ?? []).map((a) => a.user_id)))

  const results: Array<{ userId: string; ok: boolean; total?: number; error?: string }> = []
  for (const userId of userIds) {
    try {
      // Chama as functions SQL que centralizam a lógica de cálculo.
      const { data: perAccount, error: e2 } = await sb.rpc(
        "compute_per_account_balance",
        { p_user_id: userId },
      )
      if (e2) throw new Error(e2.message)

      const { data: perAccountType, error: e3 } = await sb.rpc(
        "compute_per_account_type",
        { p_user_id: userId, p_per_account: perAccount },
      )
      if (e3) throw new Error(e3.message)

      const totalCents = Object.values(
        (perAccount as Record<string, number>) ?? {},
      ).reduce<number>((sum, v) => sum + Number(v), 0)

      const { error: upsertErr } = await sb
        .from("balance_snapshots")
        .upsert(
          {
            user_id: userId,
            snapshot_date: today,
            total_balance_cents: totalCents,
            per_account: perAccount ?? {},
            per_account_type: perAccountType ?? {},
          },
          { onConflict: "user_id,snapshot_date" },
        )
      if (upsertErr) throw new Error(upsertErr.message)

      results.push({ userId, ok: true, total: totalCents })
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    snapshot_date: today,
    users_processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    details: results,
  })
}
