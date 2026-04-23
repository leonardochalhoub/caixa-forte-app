import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUser, isAdminish } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const DEMO_EMAIL = "larissa.demo@caixa-forte.app"
const DEMO_PASSWORD = "DemoPublico#2026"
const DEMO_NAME = "Larissa Oliveira"
const DEMO_AVATAR_URL = "https://randomuser.me/api/portraits/women/79.jpg"

// Pool de cidades brasileiras pra sorteio (com coords pro mapa do sysadmin)
const CITIES: Array<{ city: string; uf: string; lat: number; lng: number }> = [
  { city: "São Paulo", uf: "SP", lat: -23.55, lng: -46.63 },
  { city: "Rio de Janeiro", uf: "RJ", lat: -22.91, lng: -43.17 },
  { city: "Belo Horizonte", uf: "MG", lat: -19.92, lng: -43.94 },
  { city: "Porto Alegre", uf: "RS", lat: -30.03, lng: -51.22 },
  { city: "Curitiba", uf: "PR", lat: -25.43, lng: -49.27 },
  { city: "Salvador", uf: "BA", lat: -12.97, lng: -38.51 },
  { city: "Recife", uf: "PE", lat: -8.05, lng: -34.88 },
  { city: "Florianópolis", uf: "SC", lat: -27.59, lng: -48.55 },
  { city: "Brasília", uf: "DF", lat: -15.78, lng: -47.93 },
  { city: "Fortaleza", uf: "CE", lat: -3.73, lng: -38.52 },
  { city: "Goiânia", uf: "GO", lat: -16.68, lng: -49.25 },
  { city: "Belém", uf: "PA", lat: -1.46, lng: -48.5 },
]

type SeedLog = { step: string; detail: string; ok: boolean }

type RangeKey = "full" | "2025" | "2026" | "q1-2026" | "last-12m"

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
      for (let m = 1; m <= 12; m++) push(2025, m)
      for (let m = 1; m <= 12; m++) push(2026, m)
      return months
  }
}

// RNG seeded (mulberry32). Seed passado no setup pra dar variedade
// entre re-seeds sem depender do Math.random global.
function makeRng(seed: number) {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

// Eventos pontuais (não recorrentes). Cada um tem uma probabilidade
// de acontecer no mês + faixa de valor + descrição.
type OneOffEvent = {
  chance: number
  label: string
  category: string
  min: number
  max: number
  account?: string // default Nubank Conta
  isIncome?: boolean
}

const ONEOFF_EVENTS: OneOffEvent[] = [
  {
    chance: 0.12,
    label: "Cirurgia do Thor (vet)",
    category: "Saúde",
    min: 180000,
    max: 380000,
  },
  {
    chance: 0.08,
    label: "Cirurgia da Mel (vet)",
    category: "Saúde",
    min: 150000,
    max: 320000,
  },
  {
    chance: 0.15,
    label: "Ração + vacina dos cachorros",
    category: "Saúde",
    min: 15000,
    max: 32000,
  },
  {
    chance: 0.1,
    label: "Conserto do carro",
    category: "Transporte",
    min: 50000,
    max: 220000,
  },
  {
    chance: 0.08,
    label: "Revisão oficial Honda",
    category: "Transporte",
    min: 45000,
    max: 90000,
  },
  {
    chance: 0.06,
    label: "Dentista",
    category: "Saúde",
    min: 30000,
    max: 180000,
  },
  {
    chance: 0.07,
    label: "Geladeira nova",
    category: "Cuidados Pessoais",
    min: 250000,
    max: 420000,
  },
  {
    chance: 0.05,
    label: "Celular novo",
    category: "Cuidados Pessoais",
    min: 200000,
    max: 450000,
  },
  {
    chance: 0.1,
    label: "Viagem fim de semana",
    category: "Lazer",
    min: 60000,
    max: 180000,
  },
  {
    chance: 0.05,
    label: "Viagem internacional",
    category: "Lazer",
    min: 400000,
    max: 900000,
  },
  {
    chance: 0.06,
    label: "Presente aniversário família",
    category: "Lazer",
    min: 15000,
    max: 60000,
  },
  {
    chance: 0.04,
    label: "Curso online",
    category: "Cuidados Pessoais",
    min: 40000,
    max: 120000,
  },
  {
    chance: 0.05,
    label: "Doação cirurgia avó",
    category: "Saúde",
    min: 100000,
    max: 200000,
  },
]

function buildMonthTxs(
  userId: string,
  ym: string,
  accs: Record<string, Account>,
  cats: Record<string, Category>,
  today: Date,
  r: () => number,
): TxPayload[] {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!
  const between = (min: number, max: number) =>
    Math.round(min + r() * (max - min))
  const isFuture = (d: number) => new Date(y, m - 1, d) > today
  const isCurrentMonth =
    y === today.getFullYear() && m === today.getMonth() + 1
  const paidChance = isFuture(1) ? 0 : isCurrentMonth ? 0.7 : 0.95

  const txs: TxPayload[] = []
  const add = (
    accountName: string,
    catName: string | null,
    type: "income" | "expense",
    amountCents: number,
    day: number,
    merchant: string,
    isTransfer = false,
  ) => {
    const safeDay = Math.min(Math.max(1, day), daysInMonth(y, m))
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
      is_transfer: isTransfer,
      source: "web",
    })
  }

  // --- Salário base com variação (aumento em Jul/2025 após review) ---
  const afterRaise = y > 2025 || (y === 2025 && m >= 7)
  const salarioBase = afterRaise
    ? between(870000, 920000)
    : between(790000, 830000)
  add(
    "Nubank Conta",
    "Salário",
    "income",
    salarioBase,
    5,
    pick(["Salário TechCorp", "Pgto TechCorp SA", "Salário TechCorp BR"]),
  )

  // --- Eventos sazonais (13º, férias, PLR, restituição IR) ---
  if (m === 11) {
    // 1ª parcela do 13º em novembro
    add(
      "Nubank Conta",
      "Salário",
      "income",
      Math.round(salarioBase / 2),
      20,
      "Adiantamento 13º salário",
    )
  }
  if (m === 12) {
    // 2ª parcela do 13º em dezembro
    add(
      "Nubank Conta",
      "Salário",
      "income",
      Math.round(salarioBase / 2),
      20,
      "13º salário (2ª parcela)",
    )
  }
  if (m === 2 || m === 3) {
    // PLR anual da empresa
    if (r() < 0.7) {
      add(
        "Nubank Conta",
        "Salário",
        "income",
        between(250000, 550000),
        15,
        "PLR 2024 TechCorp",
      )
    }
  }
  if (m === 1 || m === 7) {
    // Terço de férias
    add(
      "Nubank Conta",
      "Salário",
      "income",
      Math.round(salarioBase / 3),
      5,
      "Terço de férias",
    )
  }
  if (m >= 5 && m <= 8 && r() < 0.4) {
    // Restituição IR
    add(
      "Nubank Conta",
      "Rendimentos",
      "income",
      between(30000, 180000),
      between(10, 28),
      "Restituição IR 2024",
    )
  }
  if (m % 3 === 0 && r() < 0.75) {
    // Freelance trimestral
    add(
      "Nubank Conta",
      "Freelance",
      "income",
      between(80000, 280000),
      between(12, 22),
      pick([
        "Freelance design Studio X",
        "Consultoria marketing Paulista",
        "Projeto branding",
      ]),
    )
  }

  // --- Rendimentos automáticos das aplicações (todo mês, valores pequenos) ---
  add(
    "Nubank Renda Fixa",
    "Rendimentos",
    "income",
    between(12000, 26000),
    between(1, 3),
    "Rendimentos CDB",
  )
  add(
    "Nubank Cripto",
    "Rendimentos",
    "income",
    between(2000, 12000),
    between(1, 28),
    pick(["Cashback cripto", "Staking Ether", "Valorização BTC"]),
  )
  if (r() < 0.5) {
    add(
      "Nubank Renda Variável",
      "Rendimentos",
      "income",
      between(3000, 18000),
      between(5, 20),
      "Dividendos ITSA4",
    )
  }

  // --- Aportes (transfer checking → investimentos) mensais ---
  // Simula "poupança ativa": Larissa move grana pra investir.
  if (afterRaise || r() < 0.75) {
    const aporte = between(80000, 180000)
    // Débito na conta
    add(
      "Nubank Conta",
      null,
      "expense",
      aporte,
      between(6, 10),
      "Aporte Renda Fixa",
      true,
    )
    // Crédito na RF
    add(
      "Nubank Renda Fixa",
      null,
      "income",
      aporte,
      between(6, 10),
      "Aporte mensal",
      true,
    )
  }
  if (r() < 0.5) {
    const aporte = between(20000, 80000)
    add(
      "Nubank Conta",
      null,
      "expense",
      aporte,
      between(6, 10),
      "Aporte Cripto",
      true,
    )
    add(
      "Nubank Cripto",
      null,
      "income",
      aporte,
      between(6, 10),
      "Compra BTC/ETH",
      true,
    )
  }
  if (r() < 0.35) {
    const aporte = between(30000, 120000)
    add(
      "Nubank Conta",
      null,
      "expense",
      aporte,
      between(6, 10),
      "Aporte Renda Variável",
      true,
    )
    add(
      "Nubank Renda Variável",
      null,
      "income",
      aporte,
      between(6, 10),
      "Compra ações",
      true,
    )
  }

  // --- Despesas mensais recorrentes ---
  add("Nubank Conta", "Moradia", "expense", 220000, 10, "Aluguel apto")
  add("Nubank Conta", "Moradia", "expense", between(40000, 55000), 12, "Condomínio")
  add(
    "Nubank Conta",
    "Moradia",
    "expense",
    between(12000, 24000),
    14,
    pick(["Enel Luz", "Light Energia", "Vivo Fibra", "Claro Internet"]),
  )
  add(
    "Nubank Conta",
    "Moradia",
    "expense",
    between(6000, 11000),
    16,
    "Conta de água",
  )

  const mercadoCount = between(3, 5)
  for (let i = 0; i < mercadoCount; i++) {
    add(
      "Nubank Conta",
      "Mercado",
      "expense",
      between(8000, 32000),
      between(3, 28),
      pick([
        "Mercado Pão de Açúcar",
        "Carrefour Express",
        "iFood Mercado",
        "Shopee Supermercado",
        "Extra",
        "Hortifruti",
        "Dia Supermercado",
      ]),
    )
  }

  const rideCount = between(4, 7)
  for (let i = 0; i < rideCount; i++) {
    add(
      "Nubank Conta",
      "Transporte",
      "expense",
      between(1800, 6500),
      between(2, 28),
      pick(["Uber", "99 Táxi", "Uber Trip", "99 POP"]),
    )
  }

  const foodCount = between(3, 5)
  for (let i = 0; i < foodCount; i++) {
    add(
      "Nubank Conta",
      "Alimentação",
      "expense",
      between(3500, 13000),
      between(4, 27),
      pick(["iFood", "iFood Restaurante", "Rappi", "Domino's"]),
    )
  }

  add("Nubank Conta", "Assinaturas", "expense", 5590, 8, "Netflix")
  add("Nubank Conta", "Assinaturas", "expense", 2190, 15, "Spotify")
  add("Nubank Conta", "Lazer", "expense", 12990, 20, "Smart Fit Academia")
  if (r() < 0.4) {
    add("Nubank Conta", "Assinaturas", "expense", 2999, 22, "Amazon Prime")
  }

  // Compras recreativas no cartão
  const cardBuys = between(2, 4)
  for (let i = 0; i < cardBuys; i++) {
    add(
      "Nubank Cartão",
      "Cuidados Pessoais",
      "expense",
      between(4000, 28000),
      between(2, 26),
      pick([
        "Amazon",
        "Shopee",
        "Zara",
        "Mercado Livre",
        "Amaro",
        "Renner",
        "C&A",
        "Farm",
      ]),
    )
  }

  // Fatura Nubank Cartão (lump-sum) — dia 25, sempre unpaid
  const cardInvoice = between(70000, 170000)
  const invoiceDay = Math.min(25, daysInMonth(y, m))
  const invoiceFuture = isFuture(invoiceDay)
  add(
    "Nubank Conta",
    "Assinaturas",
    "expense",
    cardInvoice,
    invoiceDay,
    "Nubank Cartão",
  )
  // Esta tx acabou de ser adicionada. Remove paid_at (fatura fica
  // agendada mesmo em meses passados — usuário pode ter pago ou não,
  // mas pra Larissa deixamos sempre aberta pra demonstrar o cenário).
  // EXCEÇÃO: se o mês já passou (não é corrente nem futuro), marca
  // como paga pra não acumular dívida crescente.
  const justAdded = txs[txs.length - 1]!
  if (!invoiceFuture && !isCurrentMonth) {
    justAdded.paid_at = isoTs(y, m, invoiceDay, 10)
  } else {
    justAdded.paid_at = null
  }

  // --- Eventos "pontuais" da vida ---
  for (const ev of ONEOFF_EVENTS) {
    if (r() < ev.chance) {
      add(
        ev.account ?? "Nubank Conta",
        ev.category,
        ev.isIncome ? "income" : "expense",
        between(ev.min, ev.max),
        between(2, 28),
        ev.label,
      )
    }
  }

  // --- Lazer básico ---
  if (r() < 0.7) {
    add(
      "Nubank Conta",
      "Lazer",
      "expense",
      between(3500, 14000),
      between(5, 26),
      pick([
        "Cinema",
        "Bar do Zé",
        "Restaurante japa",
        "Show",
        "Livraria Cultura",
        "Sympla ingresso",
      ]),
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

    // --- Seed global: baseado em timestamp pra cada re-seed ter variedade ---
    const globalSeed = Date.now() & 0xffffffff
    const r = makeRng(globalSeed)
    const picked = CITIES[Math.floor(r() * CITIES.length)]!

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

    // --- PROFILE com cidade aleatória ---
    const { error: profErr } = await sb.from("profiles").upsert(
      {
        user_id: userId,
        display_name: DEMO_NAME,
        is_demo: true,
        onboarded_at: new Date().toISOString(),
        city_name: picked.city,
        uf: picked.uf,
        lat: picked.lat,
        lng: picked.lng,
        gender: "F",
      },
      { onConflict: "user_id" },
    )
    if (profErr) throw new Error(`profile: ${profErr.message}`)
    note("profile", `cidade: ${picked.city}/${picked.uf}`)

    // --- WIPE ---
    await sb.from("transactions").delete().eq("user_id", userId)
    await sb.from("balance_adjustments").delete().eq("user_id", userId)
    await sb.from("balance_registries").delete().eq("user_id", userId)
    await sb.from("categories").delete().eq("user_id", userId)
    await sb.from("accounts").delete().eq("user_id", userId)
    note("wipe", "dados antigos removidos")

    // --- ACCOUNTS (openings redistribuídas) ---
    // Total líquido ~R$ 80k distribuído: checking baixo (2-3k), RF alta (25-35k),
    // RV 6-10k, cripto 3-6k, poupança 6-9k. FGTS fora do líquido.
    const accountSeed = [
      {
        name: "Nubank Conta",
        type: "checking",
        opening_balance_cents: 280000,
        sort_order: 0,
        balance_classification: "circulante",
      },
      {
        name: "Nubank Renda Fixa",
        type: "investment",
        opening_balance_cents: 2800000,
        sort_order: 1,
        balance_classification: "circulante",
      },
      {
        name: "Nubank Renda Variável",
        type: "investment",
        opening_balance_cents: 750000,
        sort_order: 2,
        balance_classification: "circulante",
      },
      {
        name: "Nubank Cripto",
        type: "crypto",
        opening_balance_cents: 420000,
        sort_order: 3,
        balance_classification: "circulante",
      },
      {
        name: "Caixa Poupança",
        type: "savings",
        opening_balance_cents: 680000,
        sort_order: 4,
        balance_classification: "circulante",
      },
      {
        name: "Caixa FGTS",
        type: "fgts",
        opening_balance_cents: 4200000,
        sort_order: 5,
        balance_classification: "nao_circulante",
      },
      {
        name: "Nubank Cartão",
        type: "credit",
        opening_balance_cents: 0,
        sort_order: 6,
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

    // --- TRANSACTIONS ---
    const today = new Date()
    const months = monthsForRange(range)
    note("range", `${range} → ${months.length} meses`)
    const allTxs: TxPayload[] = []
    for (const ym of months) {
      allTxs.push(
        ...buildMonthTxs(userId, ym, accountsByName, categoriesByName, today, r),
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

    // --- BALANCE ADJUSTMENTS ---
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

    // --- BALANCE REGISTRIES ---
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

    return NextResponse.json({ ok: true, userId, city: picked.city, logs })
  } catch (err) {
    note("fatal", err instanceof Error ? err.message : String(err), false)
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
