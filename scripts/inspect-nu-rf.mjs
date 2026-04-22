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

const { data: acc } = await sb
  .from("accounts")
  .select("id, name, opening_balance_cents")
  .eq("user_id", UID)
  .eq("name", "Nubank Renda Fixa")
  .is("archived_at", null)
  .maybeSingle()
console.log("account:", acc)

const { data: txs } = await sb
  .from("transactions")
  .select("id, type, amount_cents, occurred_on, is_transfer, merchant")
  .eq("user_id", UID)
  .eq("account_id", acc.id)
  .order("occurred_on", { ascending: true })
let sum = Number(acc.opening_balance_cents ?? 0)
console.log(`opening: ${sum / 100}`)
for (const t of txs ?? []) {
  const delta = t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
  sum += delta
  console.log(
    `  ${t.occurred_on} ${t.type.padEnd(7)} ${(delta / 100).toFixed(2).padStart(10)} ${
      t.is_transfer ? "[transfer]" : "          "
    } ${t.merchant ?? ""}`,
  )
}
console.log(`balance: ${(sum / 100).toFixed(2)}`)
