#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"

const today = new Date().toISOString().slice(0, 10)

const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type, opening_balance_cents")
  .eq("user_id", UID)
  .is("archived_at", null)
  .order("sort_order")

const { data: txs } = await sb
  .from("transactions")
  .select("account_id, type, amount_cents, occurred_on")
  .eq("user_id", UID)
  .lte("occurred_on", today)

const flowByAcct = new Map()
for (const t of txs) {
  const delta = t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
  flowByAcct.set(t.account_id, (flowByAcct.get(t.account_id) ?? 0) + delta)
}

console.log(`all accounts at ${today}:`)
for (const a of accounts) {
  const balance = Number(a.opening_balance_cents ?? 0) + (flowByAcct.get(a.id) ?? 0)
  console.log(`  ${a.name.padEnd(36)} ${a.type.padEnd(12)} ${(balance / 100).toFixed(2).padStart(12)}`)
}
