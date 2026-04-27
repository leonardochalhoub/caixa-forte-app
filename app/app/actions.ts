"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { transcribeAudio } from "@/lib/parser/parse-transaction"
import { resolveCategoryId } from "@/lib/parser/resolve"
import { untyped } from "@/lib/supabase/untyped"

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

// Meses em português (lowercase) pra detectar merchant como
// "Nubank Cartão Abril 2026" — precisamos saber a qual mês o
// lump-sum se refere pra decidir fatura aberta/fechada.
const MONTH_NAMES_PT_LOWER = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

function normalizePt(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

function bankKeyFromCardName(cardName: string): string {
  const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
  return normalizePt(cleaned.split(/\s+/)[0] ?? "")
}

function addMonths(ym: string, n: number): string {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

// Decide a qual fatura o charge deve pertencer: começa pelo mês
// desejado e avança enquanto a fatura daquele mês estiver paga
// (detectada por um lump-sum "<banco> cartão <mes> <ano>" com
// paid_at setado em qualquer conta). Retorna a primeira data do
// mês escolhido, ou o próprio seedDate se o mês dele já está aberto.
async function nextOpenInvoiceDate(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  cardName: string,
  seedDate: string,
): Promise<string> {
  const bankKey = bankKeyFromCardName(cardName)
  if (!bankKey) return seedDate

  // Limita a janela: o detector de "fatura fechada" via merchant
  // string só faz sentido pros últimos meses. Sem .gte e .limit, esse
  // SELECT virava full-table-scan da ledger inteira por charge.
  const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 86400_000)
    .toISOString()
    .slice(0, 10)
  const { data: lumpSumsRaw } = await untyped(supabase)
    .from("transactions")
    .select("merchant, paid_at, is_transfer, type")
    .eq("user_id", userId)
    .not("paid_at", "is", null)
    .gte("occurred_on", twoYearsAgo)
    .limit(500)
  const lumpSums = (lumpSumsRaw ?? []) as Array<{
    merchant: string | null
    paid_at: string | null
    is_transfer: boolean | null
    type: string
  }>

  const closedMonths = new Set<string>()
  for (const t of lumpSums) {
    if (t.is_transfer) continue
    if (t.type !== "expense") continue
    const m = normalizePt(t.merchant ?? "")
    if (!m.includes("cartao")) continue
    if (!m.includes(bankKey)) continue
    for (let i = 0; i < 12; i++) {
      if (!m.includes(MONTH_NAMES_PT_LOWER[i]!)) continue
      const yMatch = m.match(/(20\d{2})/)
      if (!yMatch) continue
      const year = yMatch[1]
      closedMonths.add(`${year}-${String(i + 1).padStart(2, "0")}`)
      break
    }
  }

  let ym = seedDate.slice(0, 7)
  let safety = 24
  while (closedMonths.has(ym) && safety > 0) {
    ym = addMonths(ym, 1)
    safety--
  }

  if (ym === seedDate.slice(0, 7)) return seedDate
  return `${ym}-01`
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
// Resolve a pending capture (no_account) by committing it to a
// chosen account. Uses the parsed data already stored on the
// capture_messages row.
// ============================================================

const ResolvePendingSchema = z.object({
  captureId: z.string().uuid(),
  accountId: z.string().uuid(),
  paid: z.boolean().optional(),
})

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

  const { data: tx, error: txErr } = await untyped(supabase)
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
      source: cap.channel,
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

const TextCaptureInput = z.object({ rawInput: z.string().trim().min(1).max(2000) })

export async function captureFromTextAction(
  input: z.infer<typeof TextCaptureInput>,
): Promise<CaptureResult> {
  const user = await requireUser()
  const parsed = TextCaptureInput.parse(input)
  const supabase = await createServerClient()
  const { captureText } = await import("@/lib/capture/pipeline")
  return captureText({
    client: supabase,
    userId: user.id,
    channel: "web_text",
    rawInput: parsed.rawInput,
  })
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

  const supabase = await createServerClient()
  const { captureAudio } = await import("@/lib/capture/pipeline")
  return captureAudio({
    client: supabase,
    userId: user.id,
    channel: "web_voice",
    blob,
  })
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
    const ipRaw =
      (fwd ? fwd.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null
    // Hash o IP antes de gravar — IP cru é PII (LGPD). Hash trunc
    // já permite contar únicos / detectar logins de IPs diferentes
    // sem expor o valor real. Mesmo padrão do /api/demo/enter.
    const ip = ipRaw ? Buffer.from(ipRaw).toString("base64").slice(0, 24) : null
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

