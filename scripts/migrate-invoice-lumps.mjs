#!/usr/bin/env node
// Converte transações antigas "Cartão <mês> <ano>" que moravam na conta
// corrente em faturas do cartão de crédito correspondente.
//
// Para cada lump sum "Banco Cartão Mês Ano":
//   1. Transforma a transação original numa COMPRA (charge) na conta do
//      cartão: account_id=cartão, paid_at=occurred_on+12h,
//      is_transfer=false. Representa o valor consolidado da fatura.
//   2. Cria um PAR de transferência payment: expense na conta corrente +
//      income no cartão. Mantém o mesmo paid_at/occurred_on da original
//      — se era paga, paga; se era agendada, agendada.
//
// Resultado: saldo das contas correntes não muda. Cartão fica com
// charge -X (dívida) + transfer +X (pagamento). Se o pagamento já foi
// feito, cartão zera. Se é agendada, cartão mostra -X até a fatura ser
// paga no dia.
//
// Usage: node scripts/migrate-invoice-lumps.mjs

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

const { data: accounts } = await sb
  .from("accounts")
  .select("id, name, type")
  .eq("user_id", UID)
  .is("archived_at", null)

const cards = accounts.filter((a) => a.type === "credit")

// Regra de match: procura transações cuja descrição contém "Cartão"
// seguido de mês+ano. Match por nome de banco no início da descrição
// pra decidir qual cartão é.
const { data: txs } = await sb
  .from("transactions")
  .select(
    "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, note",
  )
  .eq("user_id", UID)
  .ilike("merchant", "%Cartão%")

console.log(`🔎 ${txs.length} transações com "Cartão" na descrição\n`)

const sourceAccounts = new Map(accounts.map((a) => [a.id, a]))

function pickCardFor(txMerchant) {
  const m = (txMerchant ?? "").toLowerCase()
  for (const c of cards) {
    const cardBank = c.name
      .replace(/cart[ãa]o/i, "")
      .trim()
      .toLowerCase()
    if (cardBank && m.includes(cardBank.split(" ")[0])) {
      return c
    }
  }
  return null
}

let migrated = 0
for (const t of txs) {
  const src = sourceAccounts.get(t.account_id)
  if (!src || src.type === "credit") {
    console.log(`  ⏭  ${t.merchant} — já está num cartão ou conta desconhecida`)
    continue
  }
  const card = pickCardFor(t.merchant)
  if (!card) {
    console.log(
      `  ⏭  ${t.merchant} (R$ ${(t.amount_cents / 100).toFixed(2)}) — sem cartão correspondente`,
    )
    continue
  }
  if (t.type !== "expense") {
    console.log(`  ⏭  ${t.merchant} — não é expense`)
    continue
  }

  // 1) Vira charge no cartão: account_id novo + paid_at garantido + is_transfer=false
  const chargePaidAt = t.paid_at ?? `${t.occurred_on}T12:00:00Z`
  const { error: updErr } = await sb
    .from("transactions")
    .update({
      account_id: card.id,
      paid_at: chargePaidAt,
      is_transfer: false,
      note: `Fatura ${t.occurred_on.slice(0, 7)} — valor consolidado`,
    })
    .eq("id", t.id)
  if (updErr) {
    console.error(`  ❌ ${t.merchant}: ${updErr.message}`)
    continue
  }

  // 2) Par de transferência (pagamento): replica paid_at da original
  const transferExpense = {
    user_id: UID,
    account_id: src.id,
    type: "expense",
    amount_cents: t.amount_cents,
    occurred_on: t.occurred_on,
    paid_at: t.paid_at, // se era agendada fica agendada; se era paga fica paga
    is_transfer: true,
    merchant: `Pagamento ${card.name} · ${t.merchant}`,
    note: "Pagamento da fatura (par de transferência, auto-criado)",
    source: "manual",
    category_id: null,
  }
  const transferIncome = {
    user_id: UID,
    account_id: card.id,
    type: "income",
    amount_cents: t.amount_cents,
    occurred_on: t.occurred_on,
    paid_at: t.paid_at,
    is_transfer: true,
    merchant: `Pagamento ${card.name} · ${t.merchant}`,
    note: "Crédito pela fatura paga (par de transferência, auto-criado)",
    source: "manual",
    category_id: null,
  }
  const { error: payErr } = await sb
    .from("transactions")
    .insert([transferExpense, transferIncome])
  if (payErr) {
    console.error(`  ❌ par de pagamento: ${payErr.message}`)
    continue
  }

  console.log(
    `  ✓ ${t.merchant}  ${brl(t.amount_cents)}  ${src.name} → ${card.name}  ${t.paid_at ? "(paga)" : "(agendada)"}`,
  )
  migrated++
}

console.log(`\n✅ ${migrated} faturas migradas.`)
