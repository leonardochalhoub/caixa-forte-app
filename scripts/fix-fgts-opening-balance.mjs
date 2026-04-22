#!/usr/bin/env node
// The FGTS "saldo inicial" was stored as an income transaction on 22/04,
// which polluted the monthly fluxo líquido with 46k. FGTS accumulates over
// years — it's not an April income. Convert it to an opening_balance_cents
// on the FGTS account and drop the transaction.
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
  .eq("type", "fgts")
  .is("archived_at", null)
  .maybeSingle()

if (!acc) {
  console.log("no FGTS account")
  process.exit(0)
}

const { data: txs } = await sb
  .from("transactions")
  .select("id, amount_cents, occurred_on")
  .eq("user_id", UID)
  .eq("account_id", acc.id)
  .eq("amount_cents", 4641789)

if (!txs || txs.length === 0) {
  console.log("no FGTS saldo inicial transaction to migrate")
  process.exit(0)
}

const total = txs.reduce((s, t) => s + Number(t.amount_cents), 0)

const { error: updErr } = await sb
  .from("accounts")
  .update({ opening_balance_cents: Number(acc.opening_balance_cents ?? 0) + total })
  .eq("id", acc.id)
if (updErr) throw updErr
console.log(`bumped FGTS opening_balance_cents by ${total / 100}`)

const { error: delErr } = await sb
  .from("transactions")
  .delete()
  .in(
    "id",
    txs.map((t) => t.id),
  )
if (delErr) throw delErr
console.log(`deleted ${txs.length} redundant saldo-inicial tx`)
