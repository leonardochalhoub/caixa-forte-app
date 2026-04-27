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

const MONTHS_PT_LOWER = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function normalizeStr(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

function bankKeyFromCardName(cardName: string): string {
  const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
  return normalizeStr(cleaned.split(/\s+/)[0] ?? "")
}

// Extrai monthLowerNoAccent + year do invoiceLabel ("Nubank Cartão · Abril 2026")
// pra casar com o merchant do lump-sum agendado ("Nubank Cartão Abril 2026").
function parseInvoiceMonth(invoiceLabel: string): {
  monthName: string
  year: string
} | null {
  const norm = normalizeStr(invoiceLabel)
  const yearMatch = norm.match(/(20\d{2})/)
  if (!yearMatch) return null
  for (const monthName of MONTHS_PT_LOWER) {
    if (norm.includes(monthName)) {
      return { monthName, year: yearMatch[1]! }
    }
  }
  return null
}

// Creates a transfer pair: expense on source checking + matching
// income on the credit card account. Both marked is_transfer=true so
// KPIs don't double-count it as income/outgo. Both paid_at=now.
//
// Idempotência: se existir lump-sum agendado (paid_at=null) pra essa
// fatura — formato "<banco> Cartão <Mês> <Ano>" em qualquer conta —
// apaga ele junto. Esse lump-sum era o agendamento prévio do user;
// o transfer pair vira o registro do pagamento real.
export async function payInvoiceAction(
  input: z.infer<typeof PayInvoiceSchema>,
) {
  const user = await requireUser()
  const parsed = PayInvoiceSchema.parse(input)
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const merchant = `Pagamento fatura ${parsed.invoiceLabel}`

  // Identifica e apaga lump-sums agendados pra essa fatura — ficam
  // redundantes assim que o pagamento real é registrado.
  const { data: card } = await untyped(supabase)
    .from("accounts")
    .select("name")
    .eq("id", parsed.cardId)
    .eq("user_id", user.id)
    .maybeSingle()
  const cardName = (card as { name?: string } | null)?.name ?? ""
  const bankKey = bankKeyFromCardName(cardName)
  const invoiceMonth = parseInvoiceMonth(parsed.invoiceLabel)

  let deletedScheduledIds: string[] = []
  if (bankKey && invoiceMonth) {
    const { data: scheduled } = await untyped(supabase)
      .from("transactions")
      .select("id, merchant")
      .eq("user_id", user.id)
      .is("paid_at", null)
      .eq("type", "expense")
      .eq("is_transfer", false)
      .neq("account_id", parsed.cardId)
    const matches = ((scheduled as Array<{ id: string; merchant: string | null }>) ?? [])
      .filter((t) => {
        const m = normalizeStr(t.merchant ?? "")
        return (
          m.includes("cartao") &&
          m.includes(bankKey) &&
          m.includes(invoiceMonth.monthName) &&
          m.includes(invoiceMonth.year)
        )
      })
      .map((t) => t.id)
    if (matches.length > 0) {
      const { error: delErr } = await untyped(supabase)
        .from("transactions")
        .delete()
        .in("id", matches)
        .eq("user_id", user.id)
      if (delErr) throw new Error(`Falha ao limpar agendamento: ${delErr.message}`)
      deletedScheduledIds = matches
    }
  }

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
  return { ok: true, deletedScheduledIds }
}
