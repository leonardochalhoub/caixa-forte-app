"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
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
    await requireUser()
  } catch {
    return { ok: false, error: "Sessão inválida. Faça login de novo." }
  }
  const parsed = (() => {
    try {
      return SuggestInputSchema.parse(input)
    } catch {
      return null
    }
  })()
  if (!parsed) {
    return { ok: false, error: "Descrição inválida (mínimo 3 caracteres)." }
  }
  const groq = getGroqClient()
  if (!groq) {
    return { ok: false, error: "IA indisponível (GROQ_API_KEY ausente)." }
  }

  const system = `Você é um contador brasileiro. O usuário descreve uma operação financeira pessoal e você devolve JSON com os campos da partida dobrada.

REGRAS:
- "kind" ∈ [${AI_KINDS.join(", ")}]
  - compra_vista = comprou bem com dinheiro da conta
  - compra_financiada = comprou bem com empréstimo/financiamento
  - aporte = dinheiro de fora entrou (presente, herança, capital)
  - retirada = saída do PL (pagamento de despesa pessoal simples como PENSÃO, ALUGUEL, CONTA DE LUZ, IMPOSTO sem contrapartida de ativo/passivo)
  - valorizacao = reavaliação de um ativo (imóvel valorizou, FIPE atualizou)
  - pagamento_divida = pagou parcela/quitação de dívida registrada
  - emprestimo = pegou empréstimo (cash entra + dívida nova)
  - reclassificacao = transfere valor entre linhas sem mudar total

- "debit_section" ∈ [${AI_SECTIONS.join(", ")}] = linha que AUMENTA (se ativo) ou que DIMINUI (se passivo)
- "credit_section" idem = linha que AUMENTA (se passivo/PL) ou DIMINUI (se ativo)

TEMPLATES TÍPICOS:
- Pagamento de pensão/aluguel/despesa simples:
    kind=retirada, debit=patrimonio_liquido (despesa reduz PL), credit=ativo_circulante_disponivel
- Pagamento de fatura cartão:
    kind=pagamento_divida, debit=passivo_circulante_cartoes, credit=ativo_circulante_disponivel
- Pagou parcela de financiamento carro:
    kind=pagamento_divida, debit=passivo_nc_financiamentos, credit=ativo_circulante_disponivel
- Comprou algo grande à vista:
    kind=compra_vista, debit=ativo_nc_imobilizado, credit=ativo_circulante_disponivel
- Ganhou presente/herança em dinheiro:
    kind=aporte, debit=ativo_circulante_disponivel, credit=patrimonio_liquido
- Valorização imóvel/carro:
    kind=valorizacao, debit=ativo_nc_imobilizado, credit=patrimonio_liquido

- "debit_label" / "credit_label" = nome curto, humano, que vai aparecer no Balanço (ex: "Pensão alimentícia", "Conta corrente Nubank", "Imóvel SP")
- "amount_cents" = valor em centavos se mencionado, senão null
- "note" = observação útil ou null

Devolva APENAS JSON válido com exatamente esses 8 campos. Sem markdown, sem explicação.`

  const user = `Descrição do usuário: ${parsed.description}

JSON:`

  let content: string | null = null
  try {
    const resp = await groq.chat.completions.create({
      model: GROQ_MODELS.parser,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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
