import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cron diário: pra cada user com transações, calcula saldo total +
// breakdown por conta + por tipo de conta e insere row em
// balance_snapshots(snapshot_date=today). Idempotente via UNIQUE
// (user_id, snapshot_date) — re-executar no mesmo dia apenas atualiza.
//
// Conselho v2 (the-planner): infra de produto pra trends honestos.
// Sem isso, gráfico de "pra onde foi" é raso porque recalcula sobre
// estado atual (não captura efeitos de delete/edit em rows passadas).
//
// Vercel chama GET com header "Authorization: Bearer $CRON_SECRET".

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

  // Lista usuários distintos que têm conta. Filtramos só esses pra
  // não criar snapshots de users vazios.
  const { data: usersWithAccts, error: e1 } = await sb
    .from("accounts")
    .select("user_id", { count: "exact", head: false })
    .is("archived_at", null)
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 })
  }
  const userIds = Array.from(new Set((usersWithAccts ?? []).map((a) => a.user_id)))

  const results: Array<{ userId: string; ok: boolean; total?: number; error?: string }> = []
  for (const userId of userIds) {
    try {
      // Busca contas ativas + saldo de abertura + transações até hoje.
      const [{ data: accounts }, { data: txs }] = await Promise.all([
        sb
          .from("accounts")
          .select("id, type, opening_balance_cents")
          .eq("user_id", userId)
          .is("archived_at", null),
        sb
          .from("transactions")
          .select("account_id, amount_cents, type, paid_at, occurred_on")
          .eq("user_id", userId)
          .lte("occurred_on", today),
      ])

      const accountById = new Map(
        (accounts ?? []).map((a) => [a.id, { type: a.type, opening: Number(a.opening_balance_cents) }]),
      )

      const perAccount: Record<string, number> = {}
      for (const a of accounts ?? []) {
        perAccount[a.id] = Number(a.opening_balance_cents)
      }

      // Soma efeitos das transações (paid_at não nulo OU não-cartão pra
      // simplificar — saldo "agora" considera realizado).
      for (const t of txs ?? []) {
        const acct = accountById.get(t.account_id)
        if (!acct) continue
        const cents = Number(t.amount_cents)
        const sign = t.type === "income" ? 1 : -1
        // Para snapshot diário usamos paid_at se existe, senão occurred_on
        // já passou — incluído via filtro lte. Inclusivo (realizado).
        if (t.paid_at) {
          perAccount[t.account_id] = (perAccount[t.account_id] ?? 0) + sign * cents
        }
      }

      const perAccountType: Record<string, number> = {}
      let totalCents = 0
      for (const [accountId, cents] of Object.entries(perAccount)) {
        const type = accountById.get(accountId)?.type ?? "unknown"
        perAccountType[type] = (perAccountType[type] ?? 0) + cents
        totalCents += cents
      }

      // Upsert idempotente por (user_id, snapshot_date).
      const { error: upsertErr } = await sb
        .from("balance_snapshots")
        .upsert(
          {
            user_id: userId,
            snapshot_date: today,
            total_balance_cents: totalCents,
            per_account: perAccount,
            per_account_type: perAccountType,
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
