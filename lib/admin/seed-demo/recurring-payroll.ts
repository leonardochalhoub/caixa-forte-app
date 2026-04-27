import type { MonthCtx } from "./build-month-tx"

// Receitas recorrentes mensais da Larissa: salário base com aumento em
// jul/2025, eventos sazonais (13º, férias, PLR, restituição, freelance),
// rendimentos automáticos das aplicações e aportes (transferências para
// investimentos). A ordem das chamadas a ctx.r() / ctx.between() / ctx.add()
// é load-bearing — replica exatamente o original pra preservar o RNG.
export function addPayrollTxs(ctx: MonthCtx): void {
  const { y, m, r, pick, between, add } = ctx

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
}
