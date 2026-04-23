"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { getUser, requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { fetchFipePrice, type FipeMetadata } from "@/lib/fipe"
import { getGroqClient, GROQ_MODELS } from "@/lib/groq/client"

const CreateSchema = z.object({
  period: z.string().min(1),
  section: z.string().min(1), // ex "passivo_nc" | "ativo_nc_investimento_renda_fixa"
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int(),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function createBalanceAdjustmentAction(
  input: z.infer<typeof CreateSchema>,
) {
  const user = await requireUser()
  const parsed = CreateSchema.parse(input)
  const supabase = await createServerClient()
  const lineKey = `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await untyped(supabase)
    .from("balance_adjustments")
    .insert({
      user_id: user.id,
      period: parsed.period,
      line_key: `${parsed.section}::${lineKey}`,
      label: parsed.label,
      amount_cents: parsed.amountCents,
      note: parsed.note ?? null,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
  return data
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int(),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function updateBalanceAdjustmentAction(
  input: z.infer<typeof UpdateSchema>,
) {
  const user = await requireUser()
  const parsed = UpdateSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await untyped(supabase)
    .from("balance_adjustments")
    .update({
      label: parsed.label,
      amount_cents: parsed.amountCents,
      note: parsed.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
}

export async function refreshFipeAdjustmentAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { data, error } = await untyped(supabase)
    .from("balance_adjustments")
    .select("id, metadata, label")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Linha não encontrada.")
  const meta = (data as { metadata?: FipeMetadata }).metadata
  if (!meta || meta.source !== "fipe") {
    throw new Error("Essa linha não tem origem FIPE.")
  }
  const price = await fetchFipePrice(meta)
  const newMeta: FipeMetadata = {
    ...meta,
    last_checked_at: new Date().toISOString(),
    last_reference_month: price.referenceMonth,
  }
  const { error: updErr } = await untyped(supabase)
    .from("balance_adjustments")
    .update({
      amount_cents: price.priceCents,
      metadata: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
  if (updErr) throw new Error(updErr.message)
  revalidatePath("/app/relatorios/balanco")
  return { price: price.price, referenceMonth: price.referenceMonth }
}

// Templates de registro contábil (partida dobrada).
// Cada template já define qual seção recebe débito (ENTRA valor) e
// qual recebe crédito (SAI valor), pra evitar o user errar os lados.
export const REGISTRY_KINDS = {
  compra_vista: {
    label: "Compra à vista",
    hint: "Comprou um bem pagando com dinheiro da conta (ex: carro à vista).",
    debit: { section: "ativo_nc_imobilizado", placeholder: "O que você comprou" },
    credit: {
      section: "ativo_circulante_disponivel",
      placeholder: "Conta de onde saiu",
    },
  },
  compra_financiada: {
    label: "Compra financiada",
    hint: "Comprou um bem com financiamento/empréstimo (ex: carro via Banco Nissan).",
    debit: { section: "ativo_nc_imobilizado", placeholder: "Bem comprado" },
    credit: {
      section: "passivo_nc_financiamentos",
      placeholder: "Nome do financiamento",
    },
  },
  aporte: {
    label: "Aporte / Capital inicial",
    hint: "Dinheiro que entrou de fora do sistema (presente, herança, seu capital).",
    debit: {
      section: "ativo_circulante_disponivel",
      placeholder: "Conta onde entrou",
    },
    credit: { section: "patrimonio_liquido", placeholder: "Descrição do aporte" },
  },
  retirada: {
    label: "Retirada / Distribuição",
    hint: "Tirou dinheiro do patrimônio (ex: retirada de lucros pra fora).",
    debit: { section: "patrimonio_liquido", placeholder: "Descrição da retirada" },
    credit: {
      section: "ativo_circulante_disponivel",
      placeholder: "Conta de onde saiu",
    },
  },
  valorizacao: {
    label: "Valorização / Desvalorização",
    hint: "Reavaliação de um ativo (ex: imóvel subiu ou caiu de preço).",
    debit: { section: "ativo_nc_imobilizado", placeholder: "Qual bem" },
    credit: { section: "patrimonio_liquido", placeholder: "Motivo (ex: FIPE)" },
  },
  pagamento_divida: {
    label: "Pagamento de dívida",
    hint: "Pagou parcela/quitação de um passivo usando dinheiro da conta.",
    debit: {
      section: "passivo_nc_financiamentos",
      placeholder: "Qual dívida",
    },
    credit: {
      section: "ativo_circulante_disponivel",
      placeholder: "Conta de onde saiu",
    },
  },
  emprestimo: {
    label: "Empréstimo tomado",
    hint: "Pegou empréstimo em dinheiro (cai no banco + dívida equivalente).",
    debit: {
      section: "ativo_circulante_disponivel",
      placeholder: "Conta que recebeu",
    },
    credit: {
      section: "passivo_nc_financiamentos",
      placeholder: "Credor",
    },
  },
  reclassificacao: {
    label: "Reclassificação",
    hint: "Move valor de uma linha pra outra (sem mudar total). Usar com cuidado.",
    debit: { section: "ativo_circulante_outros", placeholder: "Linha que recebe" },
    credit: { section: "ativo_nc_imobilizado", placeholder: "Linha que perde" },
  },
} as const

const RegistrySchema = z.object({
  period: z.string().min(1),
  kind: z.enum([
    "compra_vista",
    "compra_financiada",
    "aporte",
    "retirada",
    "valorizacao",
    "pagamento_divida",
    "emprestimo",
    "reclassificacao",
  ]),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive(),
  debitSection: z.string().min(1),
  debitLabel: z.string().trim().min(1).max(80),
  creditSection: z.string().min(1),
  creditLabel: z.string().trim().min(1).max(80),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function createBalanceRegistryAction(
  input: z.infer<typeof RegistrySchema>,
) {
  const user = await requireUser()
  const parsed = RegistrySchema.parse(input)
  const supabase = await createServerClient()
  const stamp = Date.now()

  // Log da operação
  const { data: reg, error: regErr } = await untyped(supabase)
    .from("balance_registries")
    .insert({
      user_id: user.id,
      period: parsed.period,
      kind: parsed.kind,
      description: parsed.description,
      amount_cents: parsed.amountCents,
      debit_section: parsed.debitSection,
      debit_label: parsed.debitLabel,
      credit_section: parsed.creditSection,
      credit_label: parsed.creditLabel,
      note: parsed.note ?? null,
    })
    .select("id")
    .single()
  if (regErr) throw new Error(regErr.message)
  const registryId = reg.id as string

  // DÉBITO: adiciona ao lado que RECEBE valor.
  // Seções "ativo_*" e "patrimonio_liquido" aumentam com sinal +;
  // seções "passivo_*" diminuem dívida com sinal − (débito em passivo).
  const debitSign = parsed.debitSection.startsWith("passivo") ? -1 : 1

  // CRÉDITO: subtrai do lado que FORNECE valor.
  // Ativo/PL diminuem com −; Passivo aumenta com +.
  const creditSign = parsed.creditSection.startsWith("passivo") ? 1 : -1

  const pair = [
    {
      user_id: user.id,
      period: parsed.period,
      line_key: `${parsed.debitSection}::registry:${registryId}:debit`,
      label: parsed.debitLabel,
      amount_cents: parsed.amountCents * debitSign,
      note: `${parsed.description}${parsed.note ? " · " + parsed.note : ""}`,
      metadata: { registry_id: registryId, role: "debit", kind: parsed.kind },
    },
    {
      user_id: user.id,
      period: parsed.period,
      line_key: `${parsed.creditSection}::registry:${registryId}:credit`,
      label: parsed.creditLabel,
      amount_cents: parsed.amountCents * creditSign,
      note: `${parsed.description}${parsed.note ? " · " + parsed.note : ""}`,
      metadata: { registry_id: registryId, role: "credit", kind: parsed.kind },
    },
  ]
  const { error: adjErr } = await untyped(supabase)
    .from("balance_adjustments")
    .insert(pair)
  if (adjErr) throw new Error(adjErr.message)

  revalidatePath("/app/relatorios/balanco")
  return { id: registryId }
}

// IA suggestion: recebe texto livre do user e devolve os campos
// preenchidos pra partida dobrada. Não cria nada — só sugere.
const AI_SECTIONS = [
  "ativo_circulante_disponivel",
  "ativo_circulante_renda_fixa",
  "ativo_circulante_renda_variavel",
  "ativo_circulante_cripto",
  "ativo_circulante_outros",
  "ativo_nc_bloqueado",
  "ativo_nc_imobilizado",
  "ativo_nc_intangivel",
  "passivo_circulante_cartoes",
  "passivo_circulante_outros",
  "passivo_nc_financiamentos",
  "patrimonio_liquido",
] as const

const AI_KINDS = [
  "compra_vista",
  "compra_financiada",
  "aporte",
  "retirada",
  "valorizacao",
  "pagamento_divida",
  "emprestimo",
  "reclassificacao",
] as const

const SuggestInputSchema = z.object({
  description: z.string().trim().min(3).max(400),
})

type SuggestResult =
  | {
      ok: true
      kind: string
      description: string
      debit_section: string
      debit_label: string
      credit_section: string
      credit_label: string
      amount_cents: number | null
      note: string | null
    }
  | { ok: false; error: string }

export async function suggestBalanceRegistryAction(
  input: z.infer<typeof SuggestInputSchema>,
): Promise<SuggestResult> {
  try {
    return await _suggestBalanceRegistryImpl(input)
  } catch (err) {
    // Deixa redirect/http errors do Next.js propagarem
    const digest = (err as { digest?: string })?.digest
    if (digest?.startsWith?.("NEXT_")) throw err
    return {
      ok: false,
      error:
        (err as Error)?.message ??
        "Erro interno ao sugerir campos. Tente de novo em alguns segundos.",
    }
  }
}

async function _suggestBalanceRegistryImpl(
  input: z.infer<typeof SuggestInputSchema>,
): Promise<SuggestResult> {
  // getUser em vez de requireUser — não redireciona, retorna null.
  // Assim evita o NEXT_REDIRECT propagar em ação de IA (que é só
  // leitura; não faz sentido forçar redirect, só retorna ok:false).
  const user = await getUser()
  if (!user) {
    return { ok: false, error: "Sessão expirada. Recarregue a página." }
  }
  const parsed = SuggestInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Descrição inválida (mínimo 3 caracteres)." }
  }
  const groq = getGroqClient()
  if (!groq) {
    return { ok: false, error: "IA indisponível (GROQ_API_KEY ausente)." }
  }

  const system = `Você é contador formado pela USP especializado em finanças pessoais brasileiras (CPC, Lei 6.404 adaptada pra PF).
O usuário descreve em português uma operação financeira pessoal e você devolve JSON com a classificação contábil correta via partida dobrada.

==================================================
CONCEITOS FUNDAMENTAIS
==================================================
ATIVO  = o que a pessoa tem (posse: dinheiro, bens, investimentos)
PASSIVO = o que a pessoa deve (dívidas: financiamentos, cartão, contas a pagar)
PATRIMÔNIO LÍQUIDO (PL) = patrimônio pessoal = Ativo − Passivo
    → reduções de PL = despesas/retiradas (pensão, aluguel pago, imposto,
      conta de luz, mensalidade, gastos simples)
    → aumentos de PL = aportes (presente, herança, capital inicial) ou
      valorizações de ativos

Equação fundamental: ATIVO = PASSIVO + PL (sempre bate no snapshot)

==================================================
PARTIDA DOBRADA (regra de ouro)
==================================================
Todo registro tem DÉBITO + CRÉDITO de mesmo valor.
- DÉBITO aumenta Ativo/Despesa; reduz Passivo/PL/Receita.
- CRÉDITO aumenta Passivo/PL/Receita; reduz Ativo.

Pensa assim: "o valor entra em DÉBITO, sai em CRÉDITO."

==================================================
KINDS (tipo de operação — escolha sempre o mais específico)
==================================================
• compra_vista = adquiriu bem duradouro pagando à vista
    débito: ativo_nc_imobilizado (ou ativo_nc_intangivel)
    crédito: ativo_circulante_disponivel
• compra_financiada = adquiriu bem duradouro com empréstimo
    débito: ativo_nc_imobilizado
    crédito: passivo_nc_financiamentos
• aporte = dinheiro de fora entrou (não é renda recorrente)
    débito: ativo_circulante_disponivel
    crédito: patrimonio_liquido
• retirada = gasto pessoal simples que REDUZ PL (sem contrapartida em
  ativo ou dívida nova). Exemplos: pensão alimentícia, aluguel pago,
  conta de luz/água/internet, mensalidade escola/academia, IPTU/IR
  quitado, gasto com comida/lazer/transporte, salário pago a empregada.
    débito: patrimonio_liquido  (despesa)
    crédito: ativo_circulante_disponivel (de onde saiu)
• valorizacao = reavaliação de ativo não circulante (imóvel subiu/caiu,
  FIPE atualizou preço do carro, ação valorizou significativamente)
    débito: ativo_nc_imobilizado  (se positivo)
    crédito: patrimonio_liquido  (ganho/perda não realizado)
• pagamento_divida = quitou parcela/total de uma dívida já registrada
  (fatura cartão, parcela financiamento, empréstimo amortizado)
    débito: passivo_circulante_cartoes OU passivo_nc_financiamentos
    crédito: ativo_circulante_disponivel
• emprestimo = tomou empréstimo/financiamento em dinheiro
    débito: ativo_circulante_disponivel
    crédito: passivo_nc_financiamentos
• reclassificacao = transfere valor entre linhas (ex: reclassifica CDB
  longo de circulante pra não circulante quando vai travar)
    débito e crédito: 2 seções do mesmo lado (ativo↔ativo ou passivo↔passivo)

==================================================
SEÇÕES DISPONÍVEIS (use ESTA STRING EXATA)
==================================================
Ativo Circulante:
  ativo_circulante_disponivel      → contas correntes, dinheiro, carteira
  ativo_circulante_renda_fixa      → poupança, CDB liquid, Mercado Pago
  ativo_circulante_renda_variavel  → ações, FII, ETF
  ativo_circulante_cripto          → Bitcoin, ETH etc
  ativo_circulante_outros          → recebíveis curto prazo

Ativo Não Circulante:
  ativo_nc_bloqueado               → FGTS
  ativo_nc_imobilizado             → imóvel, carro, moto, equipamento
  ativo_nc_intangivel              → marca, patente, domínio, software

Passivo Circulante:
  passivo_circulante_cartoes       → fatura de cartão de crédito
  passivo_circulante_outros        → impostos a pagar, salários a pagar,
                                      boleto mês corrente não pago

Passivo Não Circulante:
  passivo_nc_financiamentos        → financiamento imóvel, consignado,
                                      parcelas longas de carro

Patrimônio:
  patrimonio_liquido               → capital pessoal, aportes,
                                      despesas (como redução de PL)

==================================================
EXEMPLOS REAIS (copie o padrão)
==================================================
1) "Paguei a pensão alimentícia de R$ 500 pela Caixa EF":
   { kind: "retirada",
     description: "Pagamento pensão alimentícia",
     debit_section: "patrimonio_liquido",
     debit_label: "Pensão alimentícia",
     credit_section: "ativo_circulante_disponivel",
     credit_label: "Caixa Econômica Federal",
     amount_cents: 50000 }

2) "Comprei a bicicleta nova no Nubank Cartão por 2500":
   { kind: "compra_vista",  (mesmo no cartão — é imobilizado que cria
     dívida, mas na prática casa com "compra_financiada" porque é a
     cartão. Use "compra_financiada" se vai parcelar em muitos meses.)
     description: "Compra bicicleta",
     debit_section: "ativo_nc_imobilizado",
     debit_label: "Bicicleta",
     credit_section: "passivo_circulante_cartoes",
     credit_label: "Nubank Cartão",
     amount_cents: 250000 }

3) "Paguei a parcela do carro R$ 614,21 pelo Nubank":
   { kind: "pagamento_divida",
     description: "Parcela financiamento carro",
     debit_section: "passivo_nc_financiamentos",
     debit_label: "Financiamento Banco Nissan",
     credit_section: "ativo_circulante_disponivel",
     credit_label: "Nubank Conta",
     amount_cents: 61421 }

4) "Recebi 5000 de presente do meu pai na Caixa":
   { kind: "aporte",
     description: "Presente recebido",
     debit_section: "ativo_circulante_disponivel",
     debit_label: "Caixa Econômica Federal",
     credit_section: "patrimonio_liquido",
     credit_label: "Presente paterno",
     amount_cents: 500000 }

5) "Meu apartamento foi avaliado em +50k":
   { kind: "valorizacao",
     description: "Reavaliação imóvel +50k",
     debit_section: "ativo_nc_imobilizado",
     debit_label: "Apartamento",
     credit_section: "patrimonio_liquido",
     credit_label: "Ganho de valorização",
     amount_cents: 5000000 }

6) "Paguei a conta de luz 180 reais":
   { kind: "retirada",
     description: "Conta de luz",
     debit_section: "patrimonio_liquido",
     debit_label: "Conta de luz",
     credit_section: "ativo_circulante_disponivel",
     credit_label: "Conta corrente",
     amount_cents: 18000 }

7) "Conta mensalidade academia 120 reais":
   { kind: "retirada",
     description: "Mensalidade academia",
     debit_section: "patrimonio_liquido",
     debit_label: "Mensalidade academia",
     credit_section: "ativo_circulante_disponivel",
     credit_label: "Conta corrente",
     amount_cents: 12000 }

8) "Quitei a fatura Nubank de R$ 3200":
   { kind: "pagamento_divida",
     description: "Pagamento fatura Nubank",
     debit_section: "passivo_circulante_cartoes",
     debit_label: "Fatura Nubank Cartão",
     credit_section: "ativo_circulante_disponivel",
     credit_label: "Conta corrente",
     amount_cents: 320000 }

==================================================
REGRAS DE PARSING DE VALORES
==================================================
- "R$ 500" ou "500 reais" → 50000 centavos
- "R$ 500,99" → 50099 centavos
- "R$ 1.500" ou "1500" → 150000 centavos
- "mil reais" → 100000, "cem" → 10000, "cinquenta" → 5000
- "cinco mil" → 500000
- Se não especificar valor, amount_cents = null

==================================================
SAÍDA
==================================================
Devolva APENAS JSON válido com estes 8 campos EXATOS. Sem markdown, sem explicação, sem ajeitar
o valor depois, sem caracteres extras.

{
  "kind": "...",
  "description": "frase curta (≤ 80 chars)",
  "debit_section": "...",
  "debit_label": "nome curto da linha",
  "credit_section": "...",
  "credit_label": "nome curto da linha",
  "amount_cents": número ou null,
  "note": "observação útil ou null"
}`

  const userPrompt = `Descrição do usuário: ${parsed.data.description}

JSON:`

  let content: string | null = null
  try {
    const resp = await groq.chat.completions.create({
      model: GROQ_MODELS.parser,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 512,
    })
    content = resp.choices[0]?.message?.content ?? null
  } catch (err) {
    return {
      ok: false,
      error: `Groq indisponível: ${(err as Error).message ?? "erro desconhecido"}`,
    }
  }
  if (!content) {
    return { ok: false, error: "IA retornou resposta vazia." }
  }

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim()

  let json: Record<string, unknown>
  try {
    json = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      error: `IA retornou formato inválido. Início: ${content.slice(0, 120)}`,
    }
  }

  // Validação mínima
  // Parse tolerante: Groq às vezes retorna amount como string ou note
  // como "null" string. Normaliza antes de validar.
  const normalizeAmount = (v: unknown): number | null => {
    if (v == null || v === "" || v === "null") return null
    if (typeof v === "number") return Math.round(v)
    if (typeof v === "string") {
      const n = Number(v.replace(/[^\d]/g, ""))
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const normalized = {
    kind: String(json.kind ?? ""),
    description: String(json.description ?? "").trim(),
    debit_section: String(json.debit_section ?? ""),
    debit_label: String(json.debit_label ?? "").trim(),
    credit_section: String(json.credit_section ?? ""),
    credit_label: String(json.credit_label ?? "").trim(),
    amount_cents: normalizeAmount(json.amount_cents),
    note:
      json.note == null || json.note === "null" || json.note === ""
        ? null
        : String(json.note).trim(),
  }

  // Validação: se kind ou section inválidos, usa fallback sensato
  const validKind = (AI_KINDS as readonly string[]).includes(normalized.kind)
    ? (normalized.kind as (typeof AI_KINDS)[number])
    : "retirada"
  const validDebitSection = (AI_SECTIONS as readonly string[]).includes(
    normalized.debit_section,
  )
    ? (normalized.debit_section as (typeof AI_SECTIONS)[number])
    : "patrimonio_liquido"
  const validCreditSection = (AI_SECTIONS as readonly string[]).includes(
    normalized.credit_section,
  )
    ? (normalized.credit_section as (typeof AI_SECTIONS)[number])
    : "ativo_circulante_disponivel"

  return {
    ok: true,
    kind: validKind,
    description: normalized.description || "Registro sem descrição",
    debit_section: validDebitSection,
    debit_label: normalized.debit_label || "Débito",
    credit_section: validCreditSection,
    credit_label: normalized.credit_label || "Crédito",
    amount_cents: normalized.amount_cents,
    note: normalized.note,
  }
}

export async function deleteBalanceRegistryAction(registryId: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  // Apaga os 2 adjustments do par
  await untyped(supabase)
    .from("balance_adjustments")
    .delete()
    .eq("user_id", user.id)
    .eq("metadata->>registry_id", registryId)
  // Apaga o registro
  const { error } = await untyped(supabase)
    .from("balance_registries")
    .delete()
    .eq("id", registryId)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
}

export async function deleteBalanceAdjustmentAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await untyped(supabase)
    .from("balance_adjustments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
}
