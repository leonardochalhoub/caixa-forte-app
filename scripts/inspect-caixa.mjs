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

const { data: caixa } = await sb
  .from("accounts")
  .select("id, name, opening_balance_cents")
  .eq("user_id", UID)
  .eq("name", "Caixa Econômica Federal")
  .is("archived_at", null)
  .maybeSingle()
console.log("account:", caixa)

const { data: txs } = await sb
  .from("transactions")
  .select("id, type, amount_cents, occurred_on, merchant, is_transfer, category_id")
  .eq("user_id", UID)
  .eq("account_id", caixa.id)
  .order("occurred_on", { ascending: true })
console.log(`\n${txs.length} transactions on Caixa:`)
let sum = Number(caixa.opening_balance_cents ?? 0)
for (const t of txs) {
  const delta = t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
  sum += delta
  console.log(
    `  ${t.occurred_on} ${t.type.padEnd(7)} ${(delta / 100).toFixed(2).padStart(10)} ${
      t.is_transfer ? "[transfer]" : "          "
    } ${t.merchant ?? ""}`,
  )
}
console.log(`\nbalance: ${(sum / 100).toFixed(2)}`)
