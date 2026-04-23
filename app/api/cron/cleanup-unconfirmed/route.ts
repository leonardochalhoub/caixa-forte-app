import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cron job: apaga usuários que nunca confirmaram email em >2 dias.
// Vercel chama GET com header "Authorization: Bearer $CRON_SECRET".
// Pra testar local: curl -H "Authorization: Bearer <secret>" <url>

export const dynamic = "force-dynamic"
export const maxDuration = 30

const GRACE_MS = 2 * 24 * 60 * 60 * 1000 // 2 dias

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

  const cutoff = new Date(Date.now() - GRACE_MS)
  const users: Array<{ id: string; email: string | null }> = []
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    for (const u of data.users) {
      if (u.email_confirmed_at) continue
      if (new Date(u.created_at) >= cutoff) continue
      users.push({ id: u.id, email: u.email ?? null })
    }
    if (data.users.length < 200) break
  }

  const results: Array<{ id: string; email: string | null; ok: boolean; error?: string }> = []
  for (const u of users) {
    const { error } = await sb.auth.admin.deleteUser(u.id)
    results.push({ ...u, ok: !error, error: error?.message })
  }

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    candidates: users.length,
    deleted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
  })
}
