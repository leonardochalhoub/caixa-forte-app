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
