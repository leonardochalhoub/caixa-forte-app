import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { parseTransaction, transcribeAudio } from "@/lib/parser/parse-transaction"
import { resolveAccountId, resolveCategoryId } from "@/lib/parser/resolve"
import type { CategoryNode } from "@/lib/parser/prompt"

// Capture pipeline shared by the web server actions (cookie-authenticated
// server client) and the Telegram webhook (admin/service-role client).
// Callers are responsible for authenticating the user and then passing the
// resolved userId + a SupabaseClient that can read/write their rows.

export type CaptureChannel =
  | "web_text"
  | "web_voice"
  | "telegram_text"
  | "telegram_voice"

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

type Client = SupabaseClient<Database>

function channelToSource(c: CaptureChannel): string {
  if (c === "telegram_text") return "telegram_text"
  if (c === "telegram_voice") return "telegram_voice"
  if (c === "web_voice") return "web_voice"
  return "web"
}

export async function loadUserContext(client: Client, userId: string) {
  const [{ data: categoriesRaw }, { data: accountsRaw }] = await Promise.all([
    client
      .from("categories")
      .select("id, name, parent_id, is_income")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
    client
      .from("accounts")
      .select("id, name, type")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
  ])

  const categoriesFlat = categoriesRaw ?? []
  const accounts = accountsRaw ?? []

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

  return { categoriesFlat, categoriesTree, accounts }
}

interface PersistArgs {
  client: Client
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
}

/**
 * Core write path. Persists the parsed transaction (or a failed capture
 * row) using whatever SupabaseClient the caller hands in. Auto-creates
 * categories that the parser suggested but don't yet exist.
 */
export async function persistCapture(args: PersistArgs): Promise<CaptureResult> {
  const { client, userId, channel } = args
  const { categoriesFlat, accounts } = await loadUserContext(client, userId)

  if (!args.parseResult || args.error) {
    const { data: captureRow, error } = await client
      .from("capture_messages")
      .insert({
        user_id: userId,
        channel,
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
    {
      category_name: p.category_name,
      subcategory_name: p.subcategory_name,
      type: p.type,
    },
    categoriesFlat,
  )

  if (!categoryId) {
    const newParent = await client
      .from("categories")
      .insert({
        user_id: userId,
        name: p.category_name,
        is_income: p.type === "income",
      })
      .select("id")
      .single()
    if (newParent.error) throw new Error(newParent.error.message)
    categoryId = newParent.data.id

    if (p.subcategory_name) {
      const newChild = await client
        .from("categories")
        .insert({
          user_id: userId,
          parent_id: categoryId,
          name: p.subcategory_name,
          is_income: p.type === "income",
        })
        .select("id")
        .single()
      if (!newChild.error && newChild.data) categoryId = newChild.data.id
    }
  } else if (p.subcategory_name) {
    const currentCat = categoriesFlat.find((c) => c.id === categoryId)
    const parentIdForLookup = currentCat?.parent_id ?? categoryId
    const childMatch = categoriesFlat.find(
      (c) =>
        c.parent_id === parentIdForLookup &&
        c.name.toLowerCase().trim() === p.subcategory_name!.toLowerCase().trim(),
    )
    if (!childMatch && currentCat && !currentCat.parent_id) {
      const newChild = await client
        .from("categories")
        .insert({
          user_id: userId,
          parent_id: currentCat.id,
          name: p.subcategory_name,
          is_income: p.type === "income",
        })
        .select("id")
        .single()
      if (!newChild.error && newChild.data) categoryId = newChild.data.id
    }
  }

  const accountId = resolveAccountId(p.account_hint, accounts)
  const resolvedAccount = accountId
    ? accounts.find((a) => a.id === accountId)
    : null
  const isCreditAccount =
    (resolvedAccount as { type?: string } | null)?.type === "credit"

  if (!accountId) {
    const { data: captureRow, error } = await client
      .from("capture_messages")
      .insert({
        user_id: userId,
        channel,
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
    const errMsg =
      accounts.length === 0
        ? "Você não tem nenhuma conta ativa. Adicione uma em /app/contas."
        : `Não entendi de qual conta. Diga na mensagem (ex: "pelo Nubank", "na Caixa") e tente de novo.`
    return {
      ok: false,
      captureId: captureRow.id,
      error: errMsg,
      fallbackFormNeeded: true,
    }
  }

  // Cartão de crédito: charge entra como dívida (paid_at=null) até a
  // fatura ser paga. Outras contas: se occurred_on já passou, é caixa
  // realizado (paid_at=hoje); futuro fica agendado.
  const today = new Date().toISOString().slice(0, 10)
  const paidAt = isCreditAccount
    ? null
    : p.occurred_on <= today
      ? `${p.occurred_on}T12:00:00Z`
      : null

  // Defesa secundária contra duplicação: se nos últimos 90s já existe tx
  // com (user, conta, tipo, valor) iguais — independente de occurred_on
  // e merchant — trata como duplicata. Cobre o caso real onde o usuário
  // reenviou a mensagem por achar que falhou e o Groq parseou cada uma
  // com data ou merchant diferente. Janela curta (90s) limita falso-
  // positivo: duas tx legítimas iguais em < 90s é raro na vida real.
  const dedupeWindowIso = new Date(Date.now() - 90_000).toISOString()
  const dedupeQuery = (
    client as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => {
              eq: (k: string, v: unknown) => {
                eq: (k: string, v: unknown) => {
                  gte: (k: string, v: string) => {
                    order: (k: string, opts: object) => {
                      limit: (n: number) => Promise<{
                        data: Array<{ id: string }> | null
                      }>
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  )
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("type", p.type)
    .eq("amount_cents", p.amount_cents)
    .gte("created_at", dedupeWindowIso)
    .order("created_at", { ascending: false })
    .limit(1)
  const { data: dupCandidates } = await dedupeQuery
  const merchantMatch = (dupCandidates ?? [])[0] ?? null
  if (merchantMatch) {
    // Tx idêntica acabou de ser criada — registra o capture apontando pra
    // ela e devolve sucesso (sem inserir duplicata).
    const { data: capDup, error: capDupErr } = await client
      .from("capture_messages")
      .insert({
        user_id: userId,
        channel,
        raw_input: args.rawInput,
        transcription: args.transcription,
        groq_parse_json: p as unknown as never,
        groq_confidence: p.confidence,
        transaction_id: merchantMatch.id,
        duration_ms: args.durationMs,
        model: args.model,
        metadata: {
          resolved: { category_id: categoryId, account_id: accountId },
          hint: p.account_hint,
          deduped: { window_seconds: 90, matched_tx: merchantMatch.id },
        },
      })
      .select("id")
      .single()
    if (capDupErr) throw new Error(capDupErr.message)
    return {
      ok: true,
      transactionId: merchantMatch.id,
      captureId: capDup.id,
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

  const { data: tx, error: txErr } = await (
    client as unknown as {
      from: (t: string) => {
        insert: (row: object) => {
          select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> }
        }
      }
    }
  )
    .from("transactions")
    .insert({
      user_id: userId,
      account_id: accountId,
      category_id: categoryId,
      type: p.type,
      amount_cents: p.amount_cents,
      occurred_on: p.occurred_on,
      merchant: p.merchant,
      note: p.note,
      source: channelToSource(channel),
      raw_input: args.rawInput,
      groq_parse_json: p,
      groq_confidence: p.confidence,
      paid_at: paidAt,
    })
    .select("id")
    .single()
  if (txErr) throw new Error(txErr.message)
  if (!tx) throw new Error("transaction insert returned no row")

  const { data: captureRow, error: capErr } = await client
    .from("capture_messages")
    .insert({
      user_id: userId,
      channel,
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

/**
 * Convenience: parse free-form text and persist in one call. Used by the
 * web server action and the Telegram webhook.
 */
export async function captureText(args: {
  client: Client
  userId: string
  channel: "web_text" | "telegram_text"
  rawInput: string
}): Promise<CaptureResult> {
  const { client, userId, channel, rawInput } = args
  const { categoriesTree, accounts } = await loadUserContext(client, userId)
  try {
    const { parsed: p, durationMs, model } = await parseTransaction({
      rawInput,
      categories: categoriesTree,
      accounts,
    })
    return persistCapture({
      client,
      userId,
      channel,
      rawInput,
      transcription: null,
      durationMs,
      model,
      parseResult: p,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao interpretar"
    return persistCapture({
      client,
      userId,
      channel,
      rawInput,
      transcription: null,
      durationMs: 0,
      model: "unknown",
      error: message,
    })
  }
}

/**
 * Convenience: transcribe audio and persist. Mirrors captureText shape.
 */
export async function captureAudio(args: {
  client: Client
  userId: string
  channel: "web_voice" | "telegram_voice"
  blob: Blob
}): Promise<CaptureResult> {
  const { client, userId, channel, blob } = args

  let transcription = ""
  let whisperModel = "unknown"
  let whisperMs = 0
  try {
    const r = await transcribeAudio(blob)
    transcription = r.text
    whisperModel = r.model
    whisperMs = r.durationMs
  } catch (err) {
    const message = err instanceof Error ? err.message : "Whisper falhou"
    return persistCapture({
      client,
      userId,
      channel,
      rawInput: "[áudio não transcrito]",
      transcription: null,
      durationMs: 0,
      model: "unknown",
      error: `Transcrição falhou: ${message}`,
    })
  }

  const { categoriesTree, accounts } = await loadUserContext(client, userId)
  try {
    const { parsed: p, durationMs, model } = await parseTransaction({
      rawInput: transcription,
      categories: categoriesTree,
      accounts,
    })
    return persistCapture({
      client,
      userId,
      channel,
      rawInput: transcription,
      transcription,
      durationMs: whisperMs + durationMs,
      model: `${whisperModel}+${model}`,
      parseResult: p,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao interpretar"
    return persistCapture({
      client,
      userId,
      channel,
      rawInput: transcription,
      transcription,
      durationMs: whisperMs,
      model: whisperModel,
      error: message,
    })
  }
}
