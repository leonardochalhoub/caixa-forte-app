"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveCategoryId } from "@/lib/parser/resolve"
import {
  captureText,
  captureAudio,
  channelToSource,
  type CaptureChannel,
} from "@/lib/capture/pipeline"
import {
  ResolvePendingSchema,
  TextCaptureInput,
  resolvePaidAt,
  nextOpenInvoiceDate,
  type CaptureResult,
} from "./shared"

// ============================================================
// Resolve a pending capture (no_account) by committing it to a
// chosen account. Uses the parsed data already stored on the
// capture_messages row.
// ============================================================

export async function resolvePendingCaptureAction(
  input: z.infer<typeof ResolvePendingSchema>,
) {
  const user = await requireUser()
  const parsed = ResolvePendingSchema.parse(input)
  const supabase = await createServerClient()

  const { data: cap, error: capErr } = await supabase
    .from("capture_messages")
    .select("id, groq_parse_json, transaction_id, error, channel, raw_input")
    .eq("id", parsed.captureId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (capErr) throw new Error(capErr.message)
  if (!cap) throw new Error("Captura não encontrada.")
  if (cap.transaction_id) throw new Error("Essa captura já virou transação.")

  const p = cap.groq_parse_json as {
    amount_cents: number
    type: "income" | "expense"
    category_name: string
    subcategory_name: string | null
    merchant: string | null
    occurred_on: string
    note: string | null
  } | null
  if (!p) throw new Error("Captura sem dados parseados.")

  const { data: categoriesRaw } = await supabase
    .from("categories")
    .select("id, name, parent_id, is_income")
    .eq("user_id", user.id)
    .is("archived_at", null)
  let categoryId = resolveCategoryId(
    {
      category_name: p.category_name,
      subcategory_name: p.subcategory_name,
      type: p.type,
    },
    categoriesRaw ?? [],
  )
  if (!categoryId) {
    const newParent = await supabase
      .from("categories")
      .insert({
        user_id: user.id,
        name: p.category_name,
        is_income: p.type === "income",
      })
      .select("id")
      .single()
    if (newParent.error) throw new Error(newParent.error.message)
    categoryId = newParent.data.id
    if (p.subcategory_name) {
      const newChild = await supabase
        .from("categories")
        .insert({
          user_id: user.id,
          parent_id: categoryId,
          name: p.subcategory_name,
          is_income: p.type === "income",
        })
        .select("id")
        .single()
      if (!newChild.error && newChild.data) categoryId = newChild.data.id
    }
  }

  // Cartão de crédito: charges individuais nunca são marcados pagos
  // na criação — só ficam "pagos" quando a fatura inteira é paga.
  const { data: targetAcc } = await supabase
    .from("accounts")
    .select("type, name")
    .eq("id", parsed.accountId)
    .eq("user_id", user.id)
    .maybeSingle()
  const isCredit = targetAcc?.type === "credit"

  const today = new Date().toISOString().slice(0, 10)
  const paidAt = isCredit ? null : resolvePaidAt(p.occurred_on, parsed.paid, today)

  // Cartão: charge nunca vai pra fatura já paga nem pro passado.
  // Encontra o primeiro mês com fatura em aberto (começando pelo
  // occurred_on original OU hoje, o que for maior).
  let effectiveOccurredOn = p.occurred_on
  if (isCredit && targetAcc) {
    effectiveOccurredOn = await nextOpenInvoiceDate(
      supabase,
      user.id,
      targetAcc.name,
      p.occurred_on < today ? today : p.occurred_on,
    )
  }

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.accountId,
      category_id: categoryId,
      type: p.type,
      amount_cents: p.amount_cents,
      occurred_on: effectiveOccurredOn,
      merchant: p.merchant,
      note: p.note,
      // Normaliza canal pro CHECK constraint transactions_source_check
      // (mig 0058). cap.channel pode ser 'web_text' que vira 'web'.
      source: channelToSource(cap.channel as CaptureChannel),
      raw_input: cap.raw_input,
      groq_parse_json: p,
      paid_at: paidAt,
    })
    .select("id")
    .single()
  if (txErr) throw new Error(txErr.message)

  const { error: updErr } = await supabase
    .from("capture_messages")
    .update({ transaction_id: tx.id, error: null })
    .eq("id", cap.id)
    .eq("user_id", user.id)
  if (updErr) throw new Error(updErr.message)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")
  return { ok: true, transactionId: tx.id }
}

export async function discardPendingCaptureAction(captureId: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("capture_messages")
    .delete()
    .eq("id", captureId)
    .eq("user_id", user.id)
    .is("transaction_id", null)
  if (error) throw new Error(error.message)
  revalidatePath("/app")
}

// ============================================================
// AI capture — text + audio
// ============================================================

export async function captureFromTextAction(
  input: z.infer<typeof TextCaptureInput>,
): Promise<CaptureResult> {
  const user = await requireUser()
  const parsed = TextCaptureInput.parse(input)
  const supabase = await createServerClient()
  return captureText({
    client: supabase,
    userId: user.id,
    channel: "web_text",
    rawInput: parsed.rawInput,
  })
}

export async function captureFromAudioAction(formData: FormData): Promise<CaptureResult> {
  const user = await requireUser()
  const file = formData.get("audio")
  if (!file || typeof file === "string") {
    throw new Error("Áudio ausente no upload.")
  }
  const blob = file as Blob
  if (blob.size === 0) throw new Error("Áudio vazio.")
  if (blob.size > 25 * 1024 * 1024) throw new Error("Áudio muito grande (máx 25MB).")

  const supabase = await createServerClient()
  return captureAudio({
    client: supabase,
    userId: user.id,
    channel: "web_voice",
    blob,
  })
}
