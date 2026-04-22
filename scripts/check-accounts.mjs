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

const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type, archived_at, opening_balance_cents")
  .eq("user_id", UID)
  .order("sort_order")

console.log("All accounts (including archived):")
for (const a of accounts ?? []) {
  console.log(`  ${a.archived_at ? "[ARCHIVED]" : "[active]  "} ${a.name} (${a.type})`)
}

const { data: fgtsTxs } = await sb
  .from("transactions")
  .select("id, account_id, amount_cents, merchant, occurred_on")
  .eq("user_id", UID)
  .eq("amount_cents", 4641789)

console.log("\nFGTS transactions (amount 4641789):")
console.log(fgtsTxs)
