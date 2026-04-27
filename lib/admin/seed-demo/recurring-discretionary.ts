import type { MonthCtx } from "./build-month-tx"
import { ONEOFF_EVENTS } from "./oneoff-events"
import { daysInMonth, isoTs } from "./utils"

// Despesas mensais da Larissa: moradia (aluguel, condomínio, contas),
// mercado, transporte, comida, assinaturas, compras de cartão, fatura
// do Nubank Cartão, eventos pontuais (ONEOFF_EVENTS) e lazer básico.
// Ordem das chamadas RNG é load-bearing — preserva o seed determinístico.
export function addDiscretionaryTxs(ctx: MonthCtx): void {
  const { y, m, r, pick, between, isFuture, isCurrentMonth, txs, add } = ctx

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
}
