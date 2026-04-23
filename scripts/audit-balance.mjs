#!/usr/bin/env node
// Per-account balance audit. For each active account, shows:
//   opening + sum(paid)       — what the UI displays
//   opening + sum(all)        — what the old reconcile flow used
//   unpaid (agendadas) delta  — how much is parked off-saldo
//
// Run:   node scripts/audit-balance.mjs <user-email>
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

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

const email = process.argv[2] ?? "leochalhoub@hotmail.com"

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: userList, error: userErr } = await sb.auth.admin.listUsers({
  page: 1,
  perPage: 200,
})
if (userErr) throw userErr
const user = userList.users.find((u) => u.email === email)
if (!user) {
  console.error(`user ${email} not found`)
  process.exit(1)
}

const brl = (c) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type, opening_balance_cents, archived_at")
  .eq("user_id", user.id)
  .is("archived_at", null)
  .order("sort_order")

const { data: txs } = await sb
  .from("transactions")
  .select("id, account_id, type, amount_cents, occurred_on, merchant, paid_at")
  .eq("user_id", user.id)

console.log(`\n🔎 Audit for ${email}  (${user.id})\n`)

let sumDisplayed = 0
let sumDisplayedExFgts = 0
const rows = []

for (const a of accounts ?? []) {
  const mine = (txs ?? []).filter((t) => t.account_id === a.id)
  const paid = mine.filter((t) => t.paid_at !== null)
  const unpaid = mine.filter((t) => t.paid_at === null)
  const sumPaid = paid.reduce(
    (s, t) => s + (t.type === "income" ? t.amount_cents : -t.amount_cents),
    0,
  )
  const sumAll = mine.reduce(
    (s, t) => s + (t.type === "income" ? t.amount_cents : -t.amount_cents),
    0,
  )
  const sumUnpaid = sumAll - sumPaid
  const opening = a.opening_balance_cents ?? 0
  const displayed = opening + sumPaid

  rows.push({
    name: a.name,
    type: a.type,
    opening,
    paidCount: paid.length,
    unpaidCount: unpaid.length,
    sumPaid,
    sumUnpaid,
    displayed,
    ajustes: paid.filter((t) => t.merchant === "Ajuste de saldo").length,
    saldoIniciais: paid.filter(
      (t) => (t.merchant ?? "").toLowerCase() === "saldo inicial",
    ).length,
  })

  sumDisplayed += displayed
  if (a.type !== "fgts") sumDisplayedExFgts += displayed
}

console.table(
  rows.map((r) => ({
    conta: r.name,
    tipo: r.type,
    "op.balance": brl(r.opening),
    "#pagas": r.paidCount,
    "Σ pagas": brl(r.sumPaid),
    "#agend.": r.unpaidCount,
    "Σ agend.": brl(r.sumUnpaid),
    "SALDO (UI)": brl(r.displayed),
    "ajustes": r.ajustes,
    "saldoIni": r.saldoIniciais,
  })),
)

console.log(`\nTotal de todas as contas:            ${brl(sumDisplayed)}`)
console.log(`Total do saldo (exclui FGTS):        ${brl(sumDisplayedExFgts)}`)

const orphans = (txs ?? []).filter(
  (t) => !(accounts ?? []).find((a) => a.id === t.account_id),
)
if (orphans.length) {
  console.log(`\n⚠️  ${orphans.length} transações em contas arquivadas:`)
  for (const t of orphans.slice(0, 10)) {
    console.log(
      `   ${t.occurred_on}  ${t.type === "income" ? "+" : "-"}${brl(t.amount_cents)}  ${t.merchant ?? "(sem merchant)"}  paid_at=${t.paid_at ?? "NULL"}`,
    )
  }
}

const adjustments = (txs ?? []).filter((t) => t.merchant === "Ajuste de saldo")
if (adjustments.length) {
  console.log(`\n🔧 ${adjustments.length} "Ajuste de saldo" no total:`)
  for (const t of adjustments) {
    const sign = t.type === "income" ? "+" : "-"
    console.log(
      `   ${t.occurred_on}  ${sign}${brl(t.amount_cents)}  paid_at=${t.paid_at ? "SIM" : "NULL (não afeta saldo!)"}`,
    )
  }
}
