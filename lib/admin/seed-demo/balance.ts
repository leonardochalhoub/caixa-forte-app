import type { SeedClient, SeedNote } from "./types"

// Ajustes de saldo do balanço patrimonial (mensal:2026-04). Honda Fit pelo
// FIPE no ativo não-circulante e o financiamento Santander no passivo.
const ADJUSTMENTS = [
  {
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
    } as Record<string, unknown> | null,
  },
  {
    period: "mensal:2026-04",
    line_key: "passivo_nc_financiamentos::custom:honda-fit-financiamento",
    label: "Financiamento Honda Fit (Santander · 28/48)",
    amount_cents: 2275000,
    note: "Parcela R$ 950/mês · 20 restantes",
    metadata: null as Record<string, unknown> | null,
  },
]

// Registros de partida-dobrada — cada um vira um par de adjustments
// (débito + crédito) com sinais corretos por seção do balanço.
const REGISTRIES_SPEC = [
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

export async function seedBalanceAdjustments(
  sb: SeedClient,
  userId: string,
  note: SeedNote,
): Promise<void> {
  const adjs = ADJUSTMENTS.map((a) => ({ user_id: userId, ...a }))
  const { error: adjErr } = await sb.from("balance_adjustments").insert(adjs)
  if (adjErr) note("adjustments", adjErr.message, false)
  else note("adjustments", `${adjs.length} inseridas`)
}

export async function seedBalanceRegistries(
  sb: SeedClient,
  userId: string,
  note: SeedNote,
): Promise<void> {
  for (const rec of REGISTRIES_SPEC) {
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
}
