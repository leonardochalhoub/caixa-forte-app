#!/usr/bin/env node
// Reconstrói o saldo total (ex-FGTS) em dois momentos:
//   1) Fim de ontem (22/04/2026 23:59:59 America/Sao_Paulo)
//   2) Agora
// e mostra todas as transações que mexeram no saldo entre os dois.

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

const brl = (c) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// Fim de ontem em UTC (São Paulo é UTC-3 ⇒ 23:59:59 de 22/04 local = 02:59:59 UTC de 23/04)
const endOfYesterdayUtc = new Date("2026-04-23T02:59:59.999Z")
const nowUtc = new Date()

const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type, opening_balance_cents")
  .eq("user_id", UID)
  .is("archived_at", null)

const accMap = new Map(accounts.map((a) => [a.id, a]))
const accepts = (a) => a.type !== "fgts"

const { data: txs } = await sb
  .from("transactions")
  .select("id, account_id, type, amount_cents, occurred_on, merchant, paid_at")
  .eq("user_id", UID)
  .not("paid_at", "is", null)
  .order("paid_at", { ascending: true })

const openingEx = accounts.filter(accepts).reduce(
  (s, a) => s + (a.opening_balance_cents ?? 0),
  0,
)

let saldoOntem = openingEx
let saldoHoje = openingEx
const deltaList = []
for (const t of txs ?? []) {
  const acc = accMap.get(t.account_id)
  if (!acc || !accepts(acc)) continue
  const delta =
    t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
  const paidAt = new Date(t.paid_at)
  if (paidAt <= endOfYesterdayUtc) saldoOntem += delta
  if (paidAt <= nowUtc) saldoHoje += delta
  if (paidAt > endOfYesterdayUtc && paidAt <= nowUtc) {
    deltaList.push({ ...t, delta, acc: acc.name })
  }
}

console.log(`\nopening (ex-FGTS) ........... ${brl(openingEx)}`)
console.log(`saldo fim de 22/04 (ontem) .. ${brl(saldoOntem)}`)
console.log(`saldo agora (23/04) ......... ${brl(saldoHoje)}`)
console.log(`diferença ................... ${brl(saldoHoje - saldoOntem)}\n`)

if (deltaList.length) {
  console.log("Movimentações desde o fim de ontem:")
  for (const d of deltaList) {
    const sinal = d.type === "income" ? "+" : "-"
    console.log(
      `  ${d.paid_at}  ${sinal}${brl(d.amount_cents).padStart(11)}  ${(d.merchant ?? "(sem)").padEnd(22)}  conta: ${d.acc}`,
    )
  }
}

// Transações registradas DEPOIS do fim de ontem mas com occurred_on antigo
// (retroativas) também entram no saldo atual e não entravam no de ontem.
console.log("\n(paid_at é quando o ajuste entra no saldo. Transações retroativas — com paid_at de hoje mas occurred_on no passado — contam como diferença.)")
