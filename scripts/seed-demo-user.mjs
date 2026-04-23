#!/usr/bin/env node
/**
 * Seed da conta de demonstração pública (Larissa Oliveira).
 *
 * - Cria o usuário auth via admin API (idempotente)
 * - Marca profile como is_demo=true
 * - Usa Groq pra gerar dados realistas brasileiros, Jan/2025 → Abr/2026:
 *   - 6 contas (checking, savings, investment, crypto, fgts, credit)
 *   - 11 categorias (8 expense + 3 income)
 *   - ~250 transações (16 meses, gerado em chunks de 2 meses)
 *   - Balance adjustments (imobilizado: carro com FIPE; financiamento)
 *   - Balance registries (2 exemplos de partida dobrada)
 *
 * Idempotente: wipe + re-seed. Auth user + profile permanecem.
 *
 * Uso: node scripts/seed-demo-user.mjs
 */
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

const DEMO_EMAIL = "larissa.demo@caixa-forte.app"
const DEMO_PASSWORD = "DemoPublico#2026"
const DEMO_NAME = "Larissa Oliveira"

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ------ AUTH USER ------
async function ensureAuthUser() {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existing = list?.users?.find((u) => u.email === DEMO_EMAIL)
  if (existing) {
    console.log(`[auth] já existe: ${existing.id}`)
    await sb.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD })
    return existing.id
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: DEMO_NAME, full_name: DEMO_NAME },
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  console.log(`[auth] criado: ${data.user.id}`)
  return data.user.id
}

async function ensureProfile(userId) {
  const { error } = await sb.from("profiles").upsert(
    {
      user_id: userId,
      display_name: DEMO_NAME,
      is_demo: true,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (error) throw new Error(`profile upsert: ${error.message}`)
  console.log(`[profile] is_demo=true`)
}

// ------ GROQ ------
async function callGroq(system, userMsg, model = "llama-3.3-70b-versatile") {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    // 429: fallback pro 8B
    if (res.status === 429 && model !== "llama-3.1-8b-instant") {
      console.log("  [groq] 429 → fallback 8b")
      return callGroq(system, userMsg, "llama-3.1-8b-instant")
    }
    throw new Error(`Groq ${res.status}: ${t}`)
  }
  const j = await res.json()
  return JSON.parse(j.choices[0].message.content)
}

// ------ ACCOUNTS ------
async function generateAccounts() {
  const system = `Gerador de contas bancárias pessoais brasileiras. Retorne JSON { "accounts": [...] }.
Cada conta: { name, type, opening_balance_cents, sort_order, balance_classification }.
Tipos: "checking", "savings", "investment", "crypto", "fgts", "credit".
opening_balance_cents é inteiro em centavos. Cartão sempre 0.
balance_classification: "circulante" (checking/savings/invest/crypto), "nao_circulante" (fgts), null (credit).`
  const user = `Gere 6 contas para Larissa Oliveira, 28 anos, analista de marketing em SP, renda ~R$ 8.500/mês, conta criada em Janeiro/2025:
- Nubank Conta (checking, saldo inicial ~R$ 1.200 em 01/01/2025)
- Nubank Renda Fixa (investment, ~R$ 6.000)
- Nubank Cripto (crypto, ~R$ 1.500)
- Caixa Poupança (savings, ~R$ 2.500)
- Caixa FGTS (fgts, ~R$ 42.000 condizente com 5 anos de CLT)
- Nubank Cartão (credit, 0)`
  const r = await callGroq(system, user)
  return r.accounts ?? []
}

// ------ CATEGORIES ------
async function generateCategories() {
  const system = `Gerador de categorias de despesa pra app de finanças pessoais. Retorne JSON { "categories": [...] }.
Cada cat: { name, emoji, kind, sort_order }. kind: "expense" ou "income". emoji: 1 emoji único.`
  const user = `Gere 8 expense + 3 income pra jovem adulta brasileira:
Expense: Moradia, Alimentação, Transporte, Saúde, Lazer, Mercado, Assinaturas, Cuidados Pessoais.
Income: Salário, Freelance, Rendimentos.`
  const r = await callGroq(system, user)
  return r.categories ?? []
}

// ------ TRANSACTIONS (chunked por 2 meses) ------
async function generateTransactionsForChunk(accounts, categories, startYm, endYm) {
  const accountList = accounts
    .map((a) => `- ${a.name} (${a.type}, id: ${a.id})`)
    .join("\n")
  const catList = categories
    .map((c) => `- ${c.name} (${c.kind}, id: ${c.id})`)
    .join("\n")
  const system = `Gerador de transações realistas de finanças pessoais brasileiras.
Retorne JSON { "transactions": [...] }. Cada tx:
{ account_id, category_id (pode ser null), type, amount_cents, occurred_on, paid_at, merchant, is_transfer: false }
- amount_cents: centavos, inteiro positivo
- occurred_on: YYYY-MM-DD
- paid_at: ISO timestamp se já paga, null se agendada
- merchant: nome realista pt-BR (ex: "iFood", "Uber", "Mercado Pão de Açúcar", "Netflix", "Salário TechCorp")
- Use APENAS os UUIDs reais abaixo`
  const user = `Larissa Oliveira, analista de marketing em SP. Gere 25-35 transações de ${startYm} a ${endYm}.

Padrão mensal esperado:
- 1 salário (~R$ 7.500-9.000, merchant "Salário <empresa>", depósito no Nubank Conta no dia 5)
- Aluguel ~R$ 2.200 (merchant "Aluguel apto SP", dia 10)
- 3-5 mercados (R$ 80-300, iFood Mercado/Pão de Açúcar/Shopee)
- 4-8 transportes (Uber/99, R$ 15-60)
- 2-4 restaurantes/delivery (iFood, R$ 30-120)
- Netflix R$ 55, Spotify R$ 22, Academia R$ 130
- 1-2 compras no cartão (direto no Nubank Cartão, merchant variado: "Amazon", "Shopee", "Zara")
- 0-1 farmácia ou saúde
- Ocasional: Freelance R$ 800-2000, presente, lazer (cinema, bar)

Se o mês é PASSADO, 95% das tx têm paid_at. Se é o mês CORRENTE (Abril 2026), 70% pagas, 30% agendadas futuras.

CONTAS:
${accountList}

CATEGORIAS:
${catList}`
  const r = await callGroq(system, user)
  return r.transactions ?? []
}

async function generateAllTransactions(accounts, categories) {
  // 16 meses = 8 chunks de 2 meses
  const chunks = [
    ["2025-01", "2025-02"],
    ["2025-03", "2025-04"],
    ["2025-05", "2025-06"],
    ["2025-07", "2025-08"],
    ["2025-09", "2025-10"],
    ["2025-11", "2025-12"],
    ["2026-01", "2026-02"],
    ["2026-03", "2026-04"],
  ]
  const all = []
  for (const [s, e] of chunks) {
    console.log(`  [groq] chunk ${s}..${e}`)
    const txs = await generateTransactionsForChunk(accounts, categories, s, e)
    all.push(...txs)
  }
  return all
}

// ------ BALANCE ADJUSTMENTS (imobilizado + financiamento) ------
function buildBalanceAdjustments(userId) {
  // Larissa comprou um Honda Fit 2020 em financiamento
  // Valor FIPE em Abril/2026 ~R$ 55.000, financiou R$ 38.000 em 48x, 20 pagas
  return [
    {
      user_id: userId,
      period: "mensal:2026-04",
      line_key: "ativo_nc_imobilizado::custom:honda-fit-2020",
      label: "Honda Fit 2020 (FIPE)",
      amount_cents: 5500000,
      note: "Valor FIPE · código 026052-6 · atualizado automaticamente",
      metadata: {
        source: "fipe",
        fipe_code: "026052-6",
        brand_id: 25,
        model_id: 5945,
        year_id: "2020-1",
        last_reference_month: "abril/2026",
      },
    },
    {
      user_id: userId,
      period: "mensal:2026-04",
      line_key: "passivo_nc_financiamentos::custom:honda-fit-financiamento",
      label: "Financiamento Honda Fit (Santander · 28/48)",
      amount_cents: 2275000,
      note: "Parcela R$ 950/mês · 20 restantes de 48",
      metadata: null,
    },
  ]
}

// ------ BALANCE REGISTRIES (partida dobrada) ------
function buildBalanceRegistries(userId) {
  return [
    {
      user_id: userId,
      period: "mensal:2026-04",
      kind: "retirada",
      description: "Mensalidade Academia",
      amount_cents: 13000,
      debit_section: "patrimonio_liquido",
      debit_label: "Academia",
      credit_section: "ativo_circulante_disponivel",
      credit_label: "Nubank Conta",
      note: "Smart Fit · débito automático",
    },
    {
      user_id: userId,
      period: "mensal:2026-03",
      kind: "pagamento_divida",
      description: "Parcela 27 do Honda Fit",
      amount_cents: 95000,
      debit_section: "passivo_nc_financiamentos",
      debit_label: "Santander Financiamento",
      credit_section: "ativo_circulante_disponivel",
      credit_label: "Nubank Conta",
      note: "Parcela mensal",
    },
  ]
}

async function insertRegistryPairs(userId, registries) {
  for (const r of registries) {
    const { data: reg } = await sb
      .from("balance_registries")
      .insert(r)
      .select("id")
      .single()
    if (!reg) continue
    const debitSign = r.debit_section.startsWith("passivo") ? -1 : 1
    const creditSign = r.credit_section.startsWith("passivo") ? 1 : -1
    await sb.from("balance_adjustments").insert([
      {
        user_id: userId,
        period: r.period,
        line_key: `${r.debit_section}::registry:${reg.id}:debit`,
        label: r.debit_label,
        amount_cents: r.amount_cents * debitSign,
        note: r.description,
        metadata: { registry_id: reg.id, role: "debit", kind: r.kind },
      },
      {
        user_id: userId,
        period: r.period,
        line_key: `${r.credit_section}::registry:${reg.id}:credit`,
        label: r.credit_label,
        amount_cents: r.amount_cents * creditSign,
        note: r.description,
        metadata: { registry_id: reg.id, role: "credit", kind: r.kind },
      },
    ])
  }
}

// ------ WIPE ------
async function wipeUserData(userId) {
  await sb.from("transactions").delete().eq("user_id", userId)
  await sb.from("balance_adjustments").delete().eq("user_id", userId)
  await sb.from("balance_registries").delete().eq("user_id", userId)
  await sb.from("categories").delete().eq("user_id", userId)
  await sb.from("accounts").delete().eq("user_id", userId)
  console.log("[wipe] dados antigos apagados")
}

// ------ MAIN ------
async function main() {
  console.log("=== Seed Larissa (demo pública) ===")
  const userId = await ensureAuthUser()
  await ensureProfile(userId)
  await wipeUserData(userId)

  console.log("[groq] gerando contas…")
  const rawAccounts = await generateAccounts()
  const accounts = rawAccounts.map((a, i) => ({
    user_id: userId,
    name: a.name,
    type: a.type,
    opening_balance_cents: Math.round(a.opening_balance_cents ?? 0),
    sort_order: a.sort_order ?? i,
    balance_classification: a.balance_classification ?? null,
  }))
  const { data: insertedAccs, error: accErr } = await sb
    .from("accounts")
    .insert(accounts)
    .select("id, name, type")
  if (accErr) throw new Error(`insert accounts: ${accErr.message}`)
  console.log(`[db] ${insertedAccs.length} contas`)

  console.log("[groq] gerando categorias…")
  const rawCats = await generateCategories()
  const cats = rawCats.map((c, i) => ({
    user_id: userId,
    name: c.name,
    emoji: c.emoji ?? "💰",
    kind: c.kind ?? "expense",
    sort_order: c.sort_order ?? i,
  }))
  const { data: insertedCats, error: catErr } = await sb
    .from("categories")
    .insert(cats)
    .select("id, name, kind")
  if (catErr) throw new Error(`insert categories: ${catErr.message}`)
  console.log(`[db] ${insertedCats.length} categorias`)

  console.log("[groq] gerando transações (Jan/2025 → Abr/2026, pode levar ~2min)…")
  const rawTxs = await generateAllTransactions(insertedAccs, insertedCats)
  const accIds = new Set(insertedAccs.map((a) => a.id))
  const catIds = new Set(insertedCats.map((c) => c.id))
  const txs = rawTxs
    .filter(
      (t) =>
        t.account_id &&
        accIds.has(t.account_id) &&
        typeof t.amount_cents === "number" &&
        t.occurred_on,
    )
    .map((t) => ({
      user_id: userId,
      account_id: t.account_id,
      category_id: t.category_id && catIds.has(t.category_id) ? t.category_id : null,
      type: t.type === "income" ? "income" : "expense",
      amount_cents: Math.abs(Math.round(t.amount_cents)),
      occurred_on: t.occurred_on,
      paid_at: t.paid_at ?? null,
      merchant: t.merchant ?? null,
      is_transfer: false,
      source: "web",
    }))
  let inserted = 0
  for (let i = 0; i < txs.length; i += 50) {
    const batch = txs.slice(i, i + 50)
    const { error } = await sb.from("transactions").insert(batch)
    if (error) {
      console.error(`  [db] batch ${i}: ${error.message}`)
      continue
    }
    inserted += batch.length
  }
  console.log(`[db] ${inserted}/${txs.length} transações`)

  console.log("[db] inserindo balance_adjustments (imobilizado + financiamento)…")
  const adjs = buildBalanceAdjustments(userId)
  const { error: adjErr } = await sb.from("balance_adjustments").insert(adjs)
  if (adjErr) console.error(`  adj err: ${adjErr.message}`)
  else console.log(`[db] ${adjs.length} adjustments`)

  console.log("[db] inserindo balance_registries (partida dobrada)…")
  await insertRegistryPairs(userId, buildBalanceRegistries(userId))

  console.log("")
  console.log("✓ Pronto!")
  console.log(`  Email:  ${DEMO_EMAIL}`)
  console.log(`  Senha:  ${DEMO_PASSWORD}`)
  console.log(`  UserId: ${userId}`)
}

main().catch((e) => {
  console.error("FALHOU:", e.message)
  process.exit(1)
})
