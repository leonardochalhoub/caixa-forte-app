"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { parseTransaction, transcribeAudio, ParserError } from "@/lib/parser/parse-transaction"
import { resolveAccountId, resolveCategoryId } from "@/lib/parser/resolve"
import { untyped } from "@/lib/supabase/untyped"
import type { CategoryNode } from "@/lib/parser/prompt"

const CreateTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida"),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  merchant: z.string().max(200).nullable(),
  note: z.string().max(1000).nullable(),
  // When true, the money is considered already settled and hits the
  // account balance immediately. When false, the row is "scheduled" —
  // stays off balance until the user later marks it as paid.
  paid: z.boolean().optional(),
})

// Computes the paid_at value from the form inputs:
//   • explicit paid=true ................ paid right now
//   • explicit paid=false ............... scheduled (null)
//   • paid omitted, occurredOn <= today . paid at noon of occurredOn (auto)
//   • paid omitted, occurredOn > today .. scheduled (null)
function resolvePaidAt(
  occurredOn: string,
  paid: boolean | undefined,
  todayIso: string,
): string | null {
  if (paid === true) return new Date().toISOString()
  if (paid === false) return null
  if (occurredOn <= todayIso) return `${occurredOn}T12:00:00Z`
  return null
}

export async function createTransactionAction(input: z.infer<typeof CreateTransactionSchema>) {
  const user = await requireUser()
  const parsed = CreateTransactionSchema.parse(input)
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const paidAt = resolvePaidAt(parsed.occurredOn, parsed.paid, today)

  const { data, error } = await untyped(supabase)
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      type: parsed.type,
      amount_cents: parsed.amountCents,
      occurred_on: parsed.occurredOn,
      merchant: parsed.merchant,
      note: parsed.note,
      source: "manual",
      paid_at: paidAt,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar transação: ${error.message}`)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")
  return data
}

const UpdateTransactionSchema = CreateTransactionSchema.extend({
  id: z.string().uuid(),
})

export async function updateTransactionAction(input: z.infer<typeof UpdateTransactionSchema>) {
  const user = await requireUser()
  const parsed = UpdateTransactionSchema.parse(input)
  const supabase = await createServerClient()

  // Only touch paid_at when the caller explicitly passes `paid`. That way
  // renaming a merchant on an already-paid tx doesn't accidentally unset
  // or reset the paid_at timestamp.
  const update: Record<string, unknown> = {
    account_id: parsed.accountId,
    category_id: parsed.categoryId,
    type: parsed.type,
    amount_cents: parsed.amountCents,
    occurred_on: parsed.occurredOn,
    merchant: parsed.merchant,
    note: parsed.note,
  }
  if (parsed.paid === true) update.paid_at = new Date().toISOString()
  if (parsed.paid === false) update.paid_at = null

  const { data, error } = await untyped(supabase)
    .from("transactions")
    .update(update)
    .eq("id", parsed.id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar: ${error.message}`)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")
  revalidatePath(`/app/transacoes/${parsed.id}`)
  return data
}

export async function deleteTransactionAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app")
  revalidatePath("/app/transacoes")
}

// ============================================================
// AI capture — text + audio
// ============================================================

export interface CaptureResult {
  ok: boolean
  transactionId?: string
  captureId: string
  error?: string
  parsed?: {
    amountCents: number
    type: "income" | "expense"
    categoryName: string
    subcategoryName: string | null
    merchant: string | null
    occurredOn: string
    confidence: number
  }
  transcription?: string
  fallbackFormNeeded?: boolean
}

async function loadUserContext(userId: string) {
  const supabase = await createServerClient()
  const [{ data: categoriesRaw }, { data: accountsRaw }, { data: lastTx }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id, is_income")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("account_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ])

  const categoriesFlat = categoriesRaw ?? []
  const accounts = accountsRaw ?? []
  const lastAccountId = lastTx?.[0]?.account_id ?? null

  const parents = categoriesFlat.filter((c) => c.parent_id === null)
  const categoriesTree: CategoryNode[] = parents.map((p) => ({
    id: p.id,
    name: p.name,
    is_income: p.is_income,
    parent_id: null,
    children: categoriesFlat
      .filter((c) => c.parent_id === p.id)
      .map((c) => ({ id: c.id, name: c.name, is_income: c.is_income })),
  }))

  return { supabase, categoriesFlat, categoriesTree, accounts, lastAccountId }
}

function channelToSource(channel: CaptureChannel): string {
  if (channel === "telegram_text") return "telegram_text"
  if (channel === "telegram_voice") return "telegram_voice"
  if (channel === "web_voice") return "web_voice"
  return "web"
}

export type CaptureChannel =
  | "web_text"
  | "web_voice"
  | "telegram_text"
  | "telegram_voice"

export async function persistCaptureAndTransaction(args: {
  userId: string
  channel: CaptureChannel
  rawInput: string
  transcription: string | null
  durationMs: number
  model: string
  parseResult?: {
    amount_cents: number
    type: "income" | "expense"
    category_name: string
    subcategory_name: string | null
    merchant: string | null
    occurred_on: string
    note: string | null
    confidence: number
    account_hint: string | null
    metadata: Record<string, unknown>
  }
  error?: string
}): Promise<CaptureResult> {
  const { supabase, categoriesFlat, accounts, lastAccountId } = await loadUserContext(args.userId)

  if (!args.parseResult || args.error) {
    const { data: captureRow, error } = await supabase
      .from("capture_messages")
      .insert({
        user_id: args.userId,
        channel: args.channel,
        raw_input: args.rawInput,
        transcription: args.transcription,
        error: args.error ?? "parse_failed",
        duration_ms: args.durationMs,
        model: args.model,
        metadata: null,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    return {
      ok: false,
      captureId: captureRow.id,
      error: args.error ?? "Não consegui interpretar.",
      transcription: args.transcription ?? undefined,
      fallbackFormNeeded: true,
    }
  }

  const p = args.parseResult
  let categoryId = resolveCategoryId(
    { category_name: p.category_name, subcategory_name: p.subcategory_name, type: p.type },
    categoriesFlat,
  )

  // Auto-create categorias que o Groq sugeriu e não existem ainda
  if (!categoryId) {
    const newParent = await supabase
      .from("categories")
      .insert({
        user_id: args.userId,
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
          user_id: args.userId,
          parent_id: categoryId,
          name: p.subcategory_name,
          is_income: p.type === "income",
        })
        .select("id")
        .single()
      if (!newChild.error && newChild.data) {
        categoryId = newChild.data.id
      }
    }
  } else if (p.subcategory_name) {
    // Pai existe mas filho pode não existir; cria se faltar
    const currentCat = categoriesFlat.find((c) => c.id === categoryId)
    const parentIdForLookup = currentCat?.parent_id ?? categoryId
    const childMatch = categoriesFlat.find(
      (c) =>
        c.parent_id === parentIdForLookup &&
        c.name.toLowerCase().trim() === p.subcategory_name!.toLowerCase().trim(),
    )
    if (!childMatch && currentCat && !currentCat.parent_id) {
      const newChild = await supabase
        .from("categories")
        .insert({
          user_id: args.userId,
          parent_id: currentCat.id,
          name: p.subcategory_name,
          is_income: p.type === "income",
        })
        .select("id")
        .single()
      if (!newChild.error && newChild.data) {
        categoryId = newChild.data.id
      }
    }
  }

  const accountId = resolveAccountId(p.account_hint, accounts, lastAccountId)

  if (!accountId) {
    const { data: captureRow, error } = await supabase
      .from("capture_messages")
      .insert({
        user_id: args.userId,
        channel: args.channel,
        raw_input: args.rawInput,
        transcription: args.transcription,
        groq_parse_json: p as unknown as never,
        groq_confidence: p.confidence,
        error: "no_account",
        duration_ms: args.durationMs,
        model: args.model,
        metadata: { resolve: { category_id: categoryId, account_id: null } },
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    return {
      ok: false,
      captureId: captureRow.id,
      error: "Você não tem nenhuma conta ativa. Adicione uma em /app/contas.",
      fallbackFormNeeded: true,
    }
  }

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      user_id: args.userId,
      account_id: accountId,
      category_id: categoryId,
      type: p.type,
      amount_cents: p.amount_cents,
      occurred_on: p.occurred_on,
      merchant: p.merchant,
      note: p.note,
      source: channelToSource(args.channel),
      raw_input: args.rawInput,
      groq_parse_json: p as unknown as never,
      groq_confidence: p.confidence,
    })
    .select("id")
    .single()
  if (txErr) throw new Error(txErr.message)

  const { data: captureRow, error: capErr } = await supabase
    .from("capture_messages")
    .insert({
      user_id: args.userId,
      channel: args.channel,
      raw_input: args.rawInput,
      transcription: args.transcription,
      groq_parse_json: p as unknown as never,
      groq_confidence: p.confidence,
      transaction_id: tx.id,
      duration_ms: args.durationMs,
      model: args.model,
      metadata: {
        resolved: { category_id: categoryId, account_id: accountId },
        hint: p.account_hint,
      },
    })
    .select("id")
    .single()
  if (capErr) throw new Error(capErr.message)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")

  return {
    ok: true,
    transactionId: tx.id,
    captureId: captureRow.id,
    parsed: {
      amountCents: p.amount_cents,
      type: p.type,
      categoryName: p.category_name,
      subcategoryName: p.subcategory_name,
      merchant: p.merchant,
      occurredOn: p.occurred_on,
      confidence: p.confidence,
    },
  }
}

const TextCaptureInput = z.object({ rawInput: z.string().trim().min(1).max(2000) })

export async function captureFromTextAction(
  input: z.infer<typeof TextCaptureInput>,
): Promise<CaptureResult> {
  const user = await requireUser()
  const parsed = TextCaptureInput.parse(input)
  const { categoriesTree, accounts } = await loadUserContext(user.id)

  try {
    const { parsed: p, durationMs, model } = await parseTransaction({
      rawInput: parsed.rawInput,
      categories: categoriesTree,
      accounts: accounts,
    })
    return persistCaptureAndTransaction({
      userId: user.id,
      channel: "web_text",
      rawInput: parsed.rawInput,
      transcription: null,
      durationMs,
      model,
      parseResult: p,
    })
  } catch (err) {
    const message =
      err instanceof ParserError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Falha ao interpretar"
    return persistCaptureAndTransaction({
      userId: user.id,
      channel: "web_text",
      rawInput: parsed.rawInput,
      transcription: null,
      durationMs: 0,
      model: "unknown",
      error: message,
    })
  }
}

export async function transcribeAudioOnlyAction(
  formData: FormData,
): Promise<{ ok: boolean; text?: string; error?: string; durationMs?: number }> {
  const user = await requireUser()
  const file = formData.get("audio")
  if (!file || typeof file === "string") {
    return { ok: false, error: "Áudio ausente no upload." }
  }
  const blob = file as Blob
  if (blob.size === 0) return { ok: false, error: "Áudio vazio." }
  if (blob.size > 25 * 1024 * 1024) return { ok: false, error: "Áudio muito grande (máx 25MB)." }

  try {
    const { text, durationMs, model } = await transcribeAudio(blob)
    const supabase = await createServerClient()
    await supabase.from("capture_messages").insert({
      user_id: user.id,
      channel: "web_voice",
      raw_input: text,
      transcription: text,
      duration_ms: durationMs,
      model,
      error: "transcribed_pending_review",
      metadata: null,
    })
    return { ok: true, text, durationMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Whisper falhou"
    return { ok: false, error: message }
  }
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

  let transcription = ""
  let whisperModel = "unknown"
  let whisperMs = 0
  try {
    const result = await transcribeAudio(blob)
    transcription = result.text
    whisperModel = result.model
    whisperMs = result.durationMs
  } catch (err) {
    const message = err instanceof Error ? err.message : "Whisper falhou"
    return persistCaptureAndTransaction({
      userId: user.id,
      channel: "web_voice",
      rawInput: "[áudio não transcrito]",
      transcription: null,
      durationMs: 0,
      model: "unknown",
      error: `Transcrição falhou: ${message}`,
    })
  }

  const { categoriesTree, accounts } = await loadUserContext(user.id)

  try {
    const { parsed: p, durationMs, model } = await parseTransaction({
      rawInput: transcription,
      categories: categoriesTree,
      accounts: accounts,
    })
    return persistCaptureAndTransaction({
      userId: user.id,
      channel: "web_voice",
      rawInput: transcription,
      transcription,
      durationMs: whisperMs + durationMs,
      model: `${whisperModel}+${model}`,
      parseResult: p,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao interpretar"
    return persistCaptureAndTransaction({
      userId: user.id,
      channel: "web_voice",
      rawInput: transcription,
      transcription,
      durationMs: whisperMs,
      model: whisperModel,
      error: message,
    })
  }
}

/**
 * Silent heartbeat: records a login event only if the latest one for this
 * user is older than 15 minutes. Called from the LoginHeartbeat client
 * component on mount/focus/interval. Degrades silently so a missing
 * login_events table never breaks the app.
 */
export async function heartbeatAction(): Promise<void> {
  try {
    const user = await requireUser()
    const admin = (await import("@/lib/supabase/admin")).createAdminClient()
    const db = (await import("@/lib/supabase/untyped")).untyped(admin)

    const { data: latest } = await db
      .from("login_events")
      .select("happened_at")
      .eq("user_id", user.id)
      .order("happened_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest?.happened_at) {
      const gapMs = Date.now() - new Date(latest.happened_at as string).getTime()
      if (gapMs < 15 * 60 * 1000) return
    }

    const h = await (await import("next/headers")).headers()
    const fwd = h.get("x-forwarded-for")
    const ip =
      (fwd ? fwd.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null
    const ua = h.get("user-agent")?.slice(0, 512) ?? null

    await db.from("login_events").insert({
      user_id: user.id,
      ip,
      user_agent: ua,
    })
  } catch {
    /* swallow — heartbeat must never surface errors */
  }
}

