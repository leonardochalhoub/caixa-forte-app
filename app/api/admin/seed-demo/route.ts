import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUser, isAdminish } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const DEMO_EMAIL = "larissa.demo@caixa-forte.app"
const DEMO_PASSWORD = "DemoPublico#2026"
const DEMO_NAME = "Larissa Oliveira"
const DEMO_AVATAR_URL = "https://randomuser.me/api/portraits/women/79.jpg"

type SeedLog = { step: string; detail: string; ok: boolean }

type RangeKey = "full" | "2025" | "2026" | "q1-2026" | "last-12m"

// ------ SEED DATA GENERATORS (sem IA externa — determinístico) ------

// Meses presentes no range selecionado. Cada mês expande pra ~18-22 tx.
function monthsForRange(range: RangeKey): string[] {
  const months: string[] = []
  const push = (y: number, m: number) =>
    months.push(`${y}-${String(m).padStart(2, "0")}`)
  switch (range) {
    case "2025":
      for (let m = 1; m <= 12; m++) push(2025, m)
      return months
    case "2026":
      for (let m = 1; m <= 12; m++) push(2026, m)
      return months
    case "q1-2026":
      for (let m = 1; m <= 3; m++) push(2026, m)
      return months
    case "last-12m": {
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        push(d.getFullYear(), d.getMonth() + 1)
      }
      return months
    }
    case "full":
    default:
      // Completo = 2025 inteiro + 2026 inteiro (24 meses). Meses futuros
      // ficam com tx agendadas (paid_at=null).
      for (let m = 1; m <= 12; m++) push(2025, m)
      for (let m = 1; m <= 12; m++) push(2026, m)
      return months
  }
}

// Pseudo-random determinístico (mulberry32) — mesmas "aleatoriedades"
// toda vez que roda, seed reproduzível.
function rng(seed: number) {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r = rng(42)
const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)]!
const between = (min: number, max: number) =>
  Math.round(min + r() * (max - min))

function pad2(n: number) {
  return String(n).padStart(2, "0")
}
function isoDate(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}
function isoTs(y: number, m: number, d: number, hour = 12) {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:00:00Z`
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

type Account = { id: string; name: string; type: string }
type Category = { id: string; name: string }

type TxPayload = {
  user_id: string
  account_id: string
  category_id: string | null
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string
  is_transfer: boolean
  source: string
}

function buildMonthTxs(
  userId: string,
  ym: string,
  accs: Record<string, Account>,
  cats: Record<string, Category>,
  today: Date,
): TxPayload[] {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const isFuture = (d: number) => new Date(y, m - 1, d) > today
  const isCurrentMonth =
    y === today.getFullYear() && m === today.getMonth() + 1
  // Mês passado: 95% pago. Mês corrente: 70% pago. Futuro: tudo agendado.
  const paidChance = isFuture(1) ? 0 : isCurrentMonth ? 0.7 : 0.95

  const txs: TxPayload[] = []
  const add = (
    accountName: string,
    catName: string | null,
    type: "income" | "expense",
    amountCents: number,
    day: number,
    merchant: string,
  ) => {
    const safeDay = Math.min(day, daysInMonth(y, m))
    const dateStr = isoDate(y, m, safeDay)
    const future = isFuture(safeDay)
    const paid = !future && r() < paidChance
    const acc = accs[accountName]
    if (!acc) return
    const cat = catName ? cats[catName] : null
    txs.push({
      user_id: userId,
      account_id: acc.id,
      category_id: cat?.id ?? null,
      type,
      amount_cents: amountCents,
      occurred_on: dateStr,
      paid_at: paid ? isoTs(y, m, safeDay, between(8, 20)) : null,
      merchant,
      is_transfer: false,
      source: "web",
    })
  }

  // Salário — dia 5, R$ 7.900-8.700
  add(
    "Nubank Conta",
    "Salário",
    "income",
    between(790000, 870000),
    5,
    pick(["Salário TechCorp", "Salário TechCorp SA", "Pgto TechCorp"]),
  )
  // Freelance a cada 3 meses (m 3/6/9/12) R$ 800-2000
  if (m % 3 === 0) {
    add(
      "Nubank Conta",
      "Freelance",
      "income",
      between(80000, 200000),
      between(12, 22),
      pick([
        "Freelance design",
        "Projeto X pagamento",
        "Consultoria marketing",
      ]),
    )
  }
  // Rendimentos (capital, non-formal) pequeno R$ 45-85 em investment
  add(
    "Nubank Renda Fixa",
    "Rendimentos",
    "income",
    between(4500, 8500),
    between(1, 3),
    "Rendimentos Renda Fixa",
  )

  // Aluguel — dia 10, R$ 2.200
  add("Nubank Conta", "Moradia", "expense", 220000, 10, "Aluguel apto SP")
  // Condomínio — dia 12, R$ 480
  add("Nubank Conta", "Moradia", "expense", 48000, 12, "Condomínio")
  // Luz/Internet alternando
  add(
    "Nubank Conta",
    "Moradia",
    "expense",
    between(12000, 22000),
    between(14, 18),
    pick(["Enel Luz", "Vivo Fibra"]),
  )

  // Mercado 3-4x
  const mercadoCount = between(3, 4)
  for (let i = 0; i < mercadoCount; i++) {
    add(
      "Nubank Conta",
      "Mercado",
      "expense",
      between(8000, 28000),
      between(3, 28),
      pick([
        "Mercado Pão de Açúcar",
        "Carrefour Express",
        "iFood Mercado",
        "Shopee Supermercado",
        "Extra Supermercado",
      ]),
    )
  }

  // Uber/99 3-5x
  const rideCount = between(3, 5)
  for (let i = 0; i < rideCount; i++) {
    add(
      "Nubank Conta",
      "Transporte",
      "expense",
      between(1800, 5500),
      between(2, 28),
      pick(["Uber", "99 Táxi", "Uber Trip"]),
    )
  }

  // iFood 2-3x
  const foodCount = between(2, 3)
  for (let i = 0; i < foodCount; i++) {
    add(
      "Nubank Conta",
      "Alimentação",
      "expense",
      between(3500, 11000),
      between(4, 27),
      pick(["iFood", "iFood Restaurante", "Rappi"]),
    )
  }

  // Assinaturas
  add("Nubank Conta", "Assinaturas", "expense", 5590, 8, "Netflix")
  add("Nubank Conta", "Assinaturas", "expense", 2190, 15, "Spotify")
  add("Nubank Conta", "Lazer", "expense", 12990, 20, "Smart Fit Academia")

  // 1-2 compras no cartão (direto no Nubank Cartão)
  const cardBuys = between(1, 2)
  for (let i = 0; i < cardBuys; i++) {
    add(
      "Nubank Cartão",
      "Cuidados Pessoais",
      "expense",
      between(5000, 28000),
      between(2, 26),
      pick([
        "Amazon",
        "Shopee",
        "Zara",
        "Mercado Livre",
        "Amaro",
        "Renner",
      ]),
    )
  }

  // Fatura Nubank Cartão — lump-sum na Nubank Conta, dia 25, unpaid
  const cardInvoice = between(60000, 140000)
  add(
    "Nubank Conta",
    "Assinaturas",
    "expense",
    cardInvoice,
    25,
    "Nubank Cartão",
  )
  // Remove o paid_at da última (fatura é sempre agendada)
  const last = txs[txs.length - 1]!
  last.paid_at = null

  // Ocasional: saúde (1/3 dos meses), lazer (metade dos meses)
  if (r() < 0.33) {
    add(
      "Nubank Conta",
      "Saúde",
      "expense",
      between(8000, 22000),
      between(6, 24),
      pick(["Farmácia Pague Menos", "Consulta Dra Ana", "Drogasil"]),
    )
  }
  if (r() < 0.5) {
    add(
      "Nubank Conta",
      "Lazer",
      "expense",
      between(3500, 12000),
      between(5, 26),
      pick(["Cinema", "Bar do Zé", "Show Allianz Parque", "Livraria Cultura"]),
    )
  }

  return txs
}

export async function POST(req: Request) {
  const logs: SeedLog[] = []
  const note = (step: string, detail: string, ok = true) =>
    logs.push({ step, detail, ok })

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      )
    }
    const isAdmin = await isAdminish()
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Apenas admin/owner pode re-semear." },
        { status: 403 },
      )
    }
    const body = (await req.json().catch(() => ({}))) as { range?: RangeKey }
    const range: RangeKey = body.range ?? "full"

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !svcKey) {
      return NextResponse.json(
        { ok: false, error: "Variáveis de ambiente ausentes." },
        { status: 503 },
      )
    }
    const sb = createClient(url, svcKey, { auth: { persistSession: false } })

    // --- AUTH USER ---
    let userId: string
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = list?.users?.find((u) => u.email === DEMO_EMAIL)
    if (existing) {
      userId = existing.id
      await sb.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        user_metadata: {
          display_name: DEMO_NAME,
          full_name: DEMO_NAME,
          avatar_url: DEMO_AVATAR_URL,
          picture: DEMO_AVATAR_URL,
        },
      })
      note("auth", `atualizou ${userId}`)
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          display_name: DEMO_NAME,
          full_name: DEMO_NAME,
          avatar_url: DEMO_AVATAR_URL,
          picture: DEMO_AVATAR_URL,
        },
      })
      if (error || !data?.user) throw new Error(`createUser: ${error?.message}`)
      userId = data.user.id
      note("auth", `criado ${userId}`)
    }

    // --- PROFILE ---
    const { error: profErr } = await sb.from("profiles").upsert(
      {
        user_id: userId,
        display_name: DEMO_NAME,
        is_demo: true,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    if (profErr) throw new Error(`profile: ${profErr.message}`)
    note("profile", "is_demo=true")

    // --- WIPE ---
    await sb.from("transactions").delete().eq("user_id", userId)
    await sb.from("balance_adjustments").delete().eq("user_id", userId)
    await sb.from("balance_registries").delete().eq("user_id", userId)
    await sb.from("categories").delete().eq("user_id", userId)
    await sb.from("accounts").delete().eq("user_id", userId)
    note("wipe", "dados antigos removidos")

    // --- ACCOUNTS ---
    const accountSeed = [
      {
        name: "Nubank Conta",
        type: "checking",
        opening_balance_cents: 120000,
        sort_order: 0,
        balance_classification: "circulante",
      },
      {
        name: "Nubank Renda Fixa",
        type: "investment",
        opening_balance_cents: 600000,
        sort_order: 1,
        balance_classification: "circulante",
      },
      {
        name: "Nubank Cripto",
        type: "crypto",
        opening_balance_cents: 150000,
        sort_order: 2,
        balance_classification: "circulante",
      },
      {
        name: "Caixa Poupança",
        type: "savings",
        opening_balance_cents: 250000,
        sort_order: 3,
        balance_classification: "circulante",
      },
      {
        name: "Caixa FGTS",
        type: "fgts",
        opening_balance_cents: 4200000,
        sort_order: 4,
        balance_classification: "nao_circulante",
      },
      {
        name: "Nubank Cartão",
        type: "credit",
        opening_balance_cents: 0,
        sort_order: 5,
        balance_classification: null,
      },
    ]
    const { data: insertedAccs, error: accErr } = await sb
      .from("accounts")
      .insert(accountSeed.map((a) => ({ ...a, user_id: userId })))
      .select("id, name, type")
    if (accErr) throw new Error(`accounts: ${accErr.message}`)
    const accountsByName: Record<string, Account> = {}
    for (const a of insertedAccs ?? []) {
      accountsByName[a.name as string] = {
        id: a.id as string,
        name: a.name as string,
        type: a.type as string,
      }
    }
    note("accounts", `${insertedAccs?.length ?? 0} inseridas`)

    // --- CATEGORIES ---
    const categorySeed = [
      { name: "Moradia", icon: "🏠", is_income: false, is_formal_income: false, sort_order: 0 },
      { name: "Alimentação", icon: "🍽️", is_income: false, is_formal_income: false, sort_order: 1 },
      { name: "Mercado", icon: "🛒", is_income: false, is_formal_income: false, sort_order: 2 },
      { name: "Transporte", icon: "🚗", is_income: false, is_formal_income: false, sort_order: 3 },
      { name: "Saúde", icon: "💊", is_income: false, is_formal_income: false, sort_order: 4 },
      { name: "Lazer", icon: "🎬", is_income: false, is_formal_income: false, sort_order: 5 },
      { name: "Assinaturas", icon: "📺", is_income: false, is_formal_income: false, sort_order: 6 },
      { name: "Cuidados Pessoais", icon: "💅", is_income: false, is_formal_income: false, sort_order: 7 },
      { name: "Salário", icon: "💼", is_income: true, is_formal_income: true, sort_order: 8 },
      { name: "Freelance", icon: "💻", is_income: true, is_formal_income: true, sort_order: 9 },
      { name: "Rendimentos", icon: "📈", is_income: true, is_formal_income: false, sort_order: 10 },
    ]
    const { data: insertedCats, error: catErr } = await sb
      .from("categories")
      .insert(categorySeed.map((c) => ({ ...c, user_id: userId })))
      .select("id, name")
    if (catErr) throw new Error(`categories: ${catErr.message}`)
    const categoriesByName: Record<string, Category> = {}
    for (const c of insertedCats ?? []) {
      categoriesByName[c.name as string] = {
        id: c.id as string,
        name: c.name as string,
      }
    }
    note("categories", `${insertedCats?.length ?? 0} inseridas`)

    // --- TRANSACTIONS (geradas deterministicamente) ---
    const today = new Date()
    const months = monthsForRange(range)
    note("range", `${range} → ${months.length} meses`)
    const allTxs: TxPayload[] = []
    for (const ym of months) {
      allTxs.push(
        ...buildMonthTxs(userId, ym, accountsByName, categoriesByName, today),
      )
    }
    let txInserted = 0
    for (let i = 0; i < allTxs.length; i += 100) {
      const batch = allTxs.slice(i, i + 100)
      const { error } = await sb.from("transactions").insert(batch)
      if (error) {
        note("tx-batch", `${i}: ${error.message}`, false)
        continue
      }
      txInserted += batch.length
    }
    note("transactions", `${txInserted}/${allTxs.length} inseridas`)

    // --- BALANCE ADJUSTMENTS (carro FIPE + financiamento) — só no mês corrente ---
    const adjs = [
      {
        user_id: userId,
        period: "mensal:2026-04",
        line_key: "ativo_nc_imobilizado::custom:honda-fit-2020",
        label: "Honda Fit 2020 (FIPE)",
        amount_cents: 5500000,
        note: "Valor FIPE · código 026052-6",
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
        note: "Parcela R$ 950/mês · 20 restantes",
        metadata: null,
      },
    ]
    const { error: adjErr } = await sb.from("balance_adjustments").insert(adjs)
    if (adjErr) note("adjustments", adjErr.message, false)
    else note("adjustments", `${adjs.length} inseridas`)

    // --- BALANCE REGISTRIES (partida dobrada exemplos) ---
    const registriesSpec = [
      {
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
    for (const rec of registriesSpec) {
      const { data: reg } = await sb
        .from("balance_registries")
        .insert({ user_id: userId, ...rec })
        .select("id")
        .single()
      if (!reg) continue
      const debitSign = rec.debit_section.startsWith("passivo") ? -1 : 1
      const creditSign = rec.credit_section.startsWith("passivo") ? 1 : -1
      await sb.from("balance_adjustments").insert([
        {
          user_id: userId,
          period: rec.period,
          line_key: `${rec.debit_section}::registry:${reg.id}:debit`,
          label: rec.debit_label,
          amount_cents: rec.amount_cents * debitSign,
          note: rec.description,
          metadata: { registry_id: reg.id, role: "debit", kind: rec.kind },
        },
        {
          user_id: userId,
          period: rec.period,
          line_key: `${rec.credit_section}::registry:${reg.id}:credit`,
          label: rec.credit_label,
          amount_cents: rec.amount_cents * creditSign,
          note: rec.description,
          metadata: { registry_id: reg.id, role: "credit", kind: rec.kind },
        },
      ])
    }
    note("registries", "2 pares partida-dobrada")

    return NextResponse.json({ ok: true, userId, logs })
  } catch (err) {
    note(
      "fatal",
      err instanceof Error ? err.message : String(err),
      false,
    )
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error && err.message ? err.message : "Erro inesperado.",
        logs,
      },
      { status: 500 },
    )
  }
}
