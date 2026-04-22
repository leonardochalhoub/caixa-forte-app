#!/usr/bin/env node
// Creates missing accounts (CM Capital IRBR3 + Caixa FGTS) and moves the
// two orphaned April-22 transactions to their correct accounts.

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

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("missing supabase env vars")
const sb = createClient(url, key, { auth: { persistSession: false } })

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"

// 1. Find the two orphaned transactions on 2026-04-22
const { data: orphans, error: e1 } = await sb
  .from("transactions")
  .select("id, merchant, amount_cents, account_id, occurred_on")
  .eq("user_id", UID)
  .eq("occurred_on", "2026-04-22")
if (e1) throw e1
console.log("orphans on 2026-04-22:", orphans)

const irbrTx = orphans.find((t) => t.amount_cents === 8808)
const fgtsTx = orphans.find((t) => t.amount_cents === 4641789)
if (!irbrTx) throw new Error("IRBR3 transaction (8808 cents) not found")
if (!fgtsTx) throw new Error("FGTS transaction (4641789 cents) not found")

// 2. Get max sort_order for accounts
const { data: maxOrder } = await sb
  .from("accounts")
  .select("sort_order")
  .eq("user_id", UID)
  .order("sort_order", { ascending: false })
  .limit(1)
const baseOrder = (maxOrder?.[0]?.sort_order ?? 0) + 1

// 3. Create CM Capital IRBR3 (investment)
const { data: cmAcc, error: e2 } = await sb
  .from("accounts")
  .insert({
    user_id: UID,
    name: "CM Capital IRBR3",
    type: "investment",
    opening_balance_cents: 0,
    sort_order: baseOrder,
  })
  .select("id, name")
  .single()
if (e2) throw e2
console.log("created:", cmAcc)

// 4. Create Caixa Econômica Federal FGTS (fgts)
const { data: fgtsAcc, error: e3 } = await sb
  .from("accounts")
  .insert({
    user_id: UID,
    name: "Caixa Econômica Federal FGTS",
    type: "fgts",
    opening_balance_cents: 0,
    sort_order: baseOrder + 1,
  })
  .select("id, name")
  .single()
if (e3) throw e3
console.log("created:", fgtsAcc)

// 5. Move transactions
const { error: e4 } = await sb
  .from("transactions")
  .update({ account_id: cmAcc.id })
  .eq("id", irbrTx.id)
if (e4) throw e4
console.log(`moved IRBR3 tx (${irbrTx.id}) → ${cmAcc.name}`)

const { error: e5 } = await sb
  .from("transactions")
  .update({ account_id: fgtsAcc.id })
  .eq("id", fgtsTx.id)
if (e5) throw e5
console.log(`moved FGTS tx (${fgtsTx.id}) → ${fgtsAcc.name}`)

// 6. Verify
const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type, opening_balance_cents")
  .eq("user_id", UID)
  .is("archived_at", null)
  .order("sort_order")
console.log("\naccounts now:")
for (const a of accounts ?? []) {
  console.log(`  ${a.name} (${a.type})`)
}
