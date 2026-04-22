#!/usr/bin/env node
// Caixa Econômica Federal should read R$ 0,00. Earlier state-rewrite
// scripts inserted a transfer leg from Caixa → Nubank Renda Fixa that
// later got deleted, leaving Caixa 4.246,22 positive. Restore the transfer
// (is_transfer=true so it stays out of KPIs) and decrement Nubank Renda
// Fixa's opening_balance by the same amount so its final balance doesn't
// change.
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
const AMOUNT = 424622 // 4246.22
const DATE = "2026-04-21"

const { data: caixa } = await sb
  .from("accounts")
  .select("id, opening_balance_cents")
  .eq("user_id", UID)
  .eq("name", "Caixa Econômica Federal")
  .is("archived_at", null)
  .maybeSingle()
const { data: nuRF } = await sb
  .from("accounts")
  .select("id, opening_balance_cents")
  .eq("user_id", UID)
  .eq("name", "Nubank Renda Fixa")
  .is("archived_at", null)
  .maybeSingle()
if (!caixa || !nuRF) throw new Error("accounts not found")

// Bail if either transfer leg already exists for this date/amount.
const { data: existing } = await sb
  .from("transactions")
  .select("id, account_id, type, is_transfer")
  .eq("user_id", UID)
  .eq("occurred_on", DATE)
  .eq("amount_cents", AMOUNT)
if ((existing ?? []).length > 0) {
  console.log("transfer legs already exist, skipping:")
  console.log(existing)
  process.exit(0)
}

const inserts = [
  {
    user_id: UID,
    account_id: caixa.id,
    type: "expense",
    amount_cents: AMOUNT,
    occurred_on: DATE,
    merchant: "→ Nubank Renda Fixa",
    note: "Transferência interna — sobra do mês",
    source: "manual",
    is_transfer: true,
  },
  {
    user_id: UID,
    account_id: nuRF.id,
    type: "income",
    amount_cents: AMOUNT,
    occurred_on: DATE,
    merchant: "← Caixa Econômica Federal",
    note: "Transferência interna recebida",
    source: "manual",
    is_transfer: true,
  },
]

const { error: insErr } = await sb.from("transactions").insert(inserts)
if (insErr) throw insErr
console.log("inserted both transfer legs")

// Rebalance Nubank Renda Fixa opening so its final stays the same.
const newOpening = Number(nuRF.opening_balance_cents ?? 0) - AMOUNT
const { error: updErr } = await sb
  .from("accounts")
  .update({ opening_balance_cents: newOpening })
  .eq("id", nuRF.id)
if (updErr) throw updErr
console.log(
  `decremented Nubank Renda Fixa opening from ${
    Number(nuRF.opening_balance_cents ?? 0) / 100
  } to ${newOpening / 100}`,
)
