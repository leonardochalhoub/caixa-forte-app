"use server"

import { createHash } from "node:crypto"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

// Deriva uma UUID v5-like estável de uma string. Usado pra idempotency
// de pay_invoice — mesma combinação (user, cartão, fatura) sempre gera
// a mesma chave, então duplo-clique vira no-op no banco.
function stableUuidFromString(input: string): string {
  const hex = createHash("sha1").update(input).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const CreateCardSchema = z.object({
  bank: z.string().trim().min(1).max(60),
  nickname: z.string().trim().max(60).optional(),
  closingDay: z.number().int().min(1).max(28).optional(),
})

export async function createCreditCardAction(
  input: z.infer<typeof CreateCardSchema>,
) {
  const user = await requireUser()
  const parsed = CreateCardSchema.parse(input)
  const supabase = await createServerClient()
  const name = parsed.nickname?.trim()
    ? `${parsed.bank} Cartão ${parsed.nickname.trim()}`
    : `${parsed.bank} Cartão`
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name,
      type: "credit",
      opening_balance_cents: 0,
      closing_day: parsed.closingDay ?? 20,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/app/cartoes")
  revalidatePath("/app/contas")
  revalidatePath("/app")
  return data
}

const UpdateClosingDaySchema = z.object({
  cardId: z.string().uuid(),
  closingDay: z.number().int().min(1).max(28),
})

export async function updateClosingDayAction(
  input: z.infer<typeof UpdateClosingDaySchema>,
) {
  const user = await requireUser()
  const parsed = UpdateClosingDaySchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("accounts")
    .update({ closing_day: parsed.closingDay })
    .eq("id", parsed.cardId)
    .eq("user_id", user.id)
    .eq("type", "credit")
  if (error) throw new Error(error.message)
  revalidatePath("/app/cartoes")
  revalidatePath("/app")
  return { ok: true }
}

const PayInvoiceSchema = z.object({
  cardId: z.string().uuid(),
  sourceAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  invoiceLabel: z.string().min(1).max(60),
})

// Atomicidade: chama public.pay_invoice (Postgres function, mig 0035).
// Tudo numa transação — apaga lump-sums agendados, marca charges
// como pagos, cria expense (saída real) + income transfer (offset de
// dívida). Falha em qualquer passo aborta tudo. RPC dispensa o
// código TS que tinha 4 writes sequenciais frágeis.
export async function payInvoiceAction(
  input: z.infer<typeof PayInvoiceSchema>,
) {
  const user = await requireUser()
  const parsed = PayInvoiceSchema.parse(input)
  const supabase = await createServerClient()

  // Idempotência: chave determinística por (user, cartão, fatura).
  // Duplo-clique ou retry de rede gera mesma chave → RPC retorna o
  // par existente sem reinserir (mig 0048).
  const idempotencyKey = stableUuidFromString(
    `${user.id}::${parsed.cardId}::${parsed.invoiceLabel}`,
  )

  const { data, error } = await supabase.rpc("pay_invoice", {
    p_card_id: parsed.cardId,
    p_source_account_id: parsed.sourceAccountId,
    p_amount_cents: parsed.amountCents,
    p_invoice_label: parsed.invoiceLabel,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw new Error(`Falha ao pagar fatura: ${error.message}`)

  revalidatePath("/app/cartoes")
  revalidatePath("/app")
  revalidatePath("/app/contas")
  const result = data as {
    deleted_scheduled_ids?: string[]
    marked_charge_ids?: string[]
    idempotent_replay?: boolean
  } | null
  return {
    ok: true,
    deletedScheduledIds: result?.deleted_scheduled_ids ?? [],
    markedChargeIds: result?.marked_charge_ids ?? [],
    idempotentReplay: result?.idempotent_replay ?? false,
  }
}

const VoidInvoicePaymentSchema = z.object({
  txId: z.string().uuid(),
})

// Desfaz pagamento de fatura via RPC void_transfer (mig 0043).
// Apaga ambos os lados do par transfer (expense na corrente +
// income no cartão) numa única transação. Cobre o caso "paguei
// errado, queria desfazer". Os charges originais que foram
// marcados como pagos pelo pay_invoice ficam paid_at=now() —
// se quiser revertê-los também, é manual (não desfaz aqui pra
// evitar destrutividade ambígua). Mas o saldo do cartão volta
// pra mostrar dívida pendente.
export async function voidInvoicePaymentAction(
  input: z.infer<typeof VoidInvoicePaymentSchema>,
) {
  await requireUser()
  const parsed = VoidInvoicePaymentSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc("void_transfer", {
    p_tx_id: parsed.txId,
  })
  if (error) throw new Error(`Falha ao desfazer pagamento: ${error.message}`)

  revalidatePath("/app/cartoes")
  revalidatePath("/app")
  revalidatePath("/app/contas")
  return {
    ok: true,
    deletedIds: (data as { deleted_ids?: string[] })?.deleted_ids ?? [],
    orphan: (data as { orphan?: boolean })?.orphan ?? false,
  }
}
