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
const accountName = process.argv[2] ?? "Nubank Renda Fixa"

const { data: acc } = await sb
  .from("accounts")
  .select("id, name, opening_balance_cents")
  .eq("user_id", UID)
  .eq("name", accountName)
  .maybeSingle()

if (!acc) {
  console.error(`Conta "${accountName}" não encontrada.`)
  process.exit(1)
}

const brl = (c) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const { data: txs } = await sb
  .from("transactions")
  .select("id, type, amount_cents, occurred_on, merchant, note, paid_at")
  .eq("user_id", UID)
  .eq("account_id", acc.id)
  .order("occurred_on", { ascending: true })

console.log(`\n📒 ${acc.name}   (opening: ${brl(acc.opening_balance_cents ?? 0)})\n`)

let running = acc.opening_balance_cents ?? 0
for (const t of txs ?? []) {
  const sign = t.type === "income" ? "+" : "-"
  const delta = t.type === "income" ? t.amount_cents : -t.amount_cents
  if (t.paid_at) running += delta
  const status = t.paid_at ? "✓ paga    " : "⏳ agendada"
  console.log(
    `  ${t.occurred_on}  ${status}  ${sign}${brl(t.amount_cents).padStart(12)}   ${(t.merchant ?? "(sem merchant)").padEnd(24)}  → saldo: ${brl(running)}`,
  )
}
console.log(`\nSaldo final (opening + pagas): ${brl(running)}\n`)
