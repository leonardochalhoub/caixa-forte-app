"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"

const CreateCardSchema = z.object({
  bank: z.string().trim().min(1).max(60),
  nickname: z.string().trim().max(60).optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
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
  const { data, error } = await untyped(supabase)
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
  closingDay: z.number().int().min(1).max(31),
})

export async function updateClosingDayAction(
  input: z.infer<typeof UpdateClosingDaySchema>,
) {
  const user = await requireUser()
  const parsed = UpdateClosingDaySchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await untyped(supabase)
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

// Creates a transfer pair: expense on source checking + matching
// income on the credit card account. Both marked is_transfer=true so
// KPIs don't double-count it as income/outgo. Both paid_at=now.
export async function payInvoiceAction(
  input: z.infer<typeof PayInvoiceSchema>,
) {
  const user = await requireUser()
  const parsed = PayInvoiceSchema.parse(input)
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const merchant = `Pagamento fatura ${parsed.invoiceLabel}`

  const { error: expErr } = await untyped(supabase)
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.sourceAccountId,
      category_id: null,
      type: "expense",
      amount_cents: parsed.amountCents,
      occurred_on: today,
      merchant,
      note: `Pagamento da fatura ${parsed.invoiceLabel}`,
      source: "manual",
      is_transfer: true,
      paid_at: nowIso,
    })
  if (expErr) throw new Error(expErr.message)

  const { error: incErr } = await untyped(supabase)
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.cardId,
      category_id: null,
      type: "income",
      amount_cents: parsed.amountCents,
      occurred_on: today,
      merchant,
      note: `Entrada crédito — fatura ${parsed.invoiceLabel} paga`,
      source: "manual",
      is_transfer: true,
      paid_at: nowIso,
    })
  if (incErr) throw new Error(incErr.message)

  revalidatePath("/app/cartoes")
  revalidatePath("/app")
  revalidatePath("/app/contas")
  return { ok: true }
}
