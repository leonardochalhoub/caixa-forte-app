import type {
  Account,
  Category,
  OneOffEvent,
  SeedClient,
  SeedNote,
  TxPayload,
} from "./types"
import { daysInMonth, isoDate, isoTs } from "./utils"

export const ONEOFF_EVENTS: OneOffEvent[] = [
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

export function buildMonthTxs(
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

export async function seedTransactions(
  sb: SeedClient,
  userId: string,
  months: string[],
  accountsByName: Record<string, Account>,
  categoriesByName: Record<string, Category>,
  r: () => number,
  note: SeedNote,
): Promise<{ inserted: number; total: number }> {
  const today = new Date()
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
  return { inserted: txInserted, total: allTxs.length }
}
