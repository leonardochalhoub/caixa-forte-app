import { getGroqClient, GROQ_MODELS } from "@/lib/groq/client"
import { nowInSaoPaulo } from "@/lib/time"
import { ParseResultSchema, type ParseResult } from "./schema"
import { parserSystemPrompt, type Account, type CategoryNode } from "./prompt"

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "ParserError"
  }
}

// Fallback parser model used when the primary 8b-instant hits 429 on all
// three retries. 70b-versatile has a separate per-minute budget so it can
// absorb the overflow when 8b is saturated, at the cost of a bit more
// latency. Override via GROQ_PARSER_FALLBACK_MODEL.
const FALLBACK_PARSER_MODEL =
  process.env.GROQ_PARSER_FALLBACK_MODEL ?? "llama-3.3-70b-versatile"

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null
  if (!e) return false
  if (e.status === 429) return true
  const msg = (e.message ?? "").toLowerCase()
  return msg.includes("rate limit") || msg.includes("429")
}

/**
 * Parses a single chat-completion call with retry + fallback.
 * Retries the same model twice on 429 with exponential backoff, then
 * switches to the fallback model for one last attempt. That's enough to
 * ride out Groq's short-window throttling (typically sub-minute) without
 * blocking the caller for too long.
 */
async function completeWithRetry(
  groq: ReturnType<typeof getGroqClient>,
  primaryModel: string,
  system: string,
  user: string,
): Promise<{ model: string; content: string; durationMs: number }> {
  if (!groq) throw new ParserError("GROQ_API_KEY não configurada")

  const attempts: Array<{ model: string; delayMs: number }> = [
    { model: primaryModel, delayMs: 0 },
    { model: primaryModel, delayMs: 1200 },
    { model: primaryModel, delayMs: 3000 },
    { model: FALLBACK_PARSER_MODEL, delayMs: 0 },
  ]

  let lastErr: unknown = null
  for (const a of attempts) {
    if (a.delayMs > 0) await sleep(a.delayMs)
    try {
      const started = Date.now()
      const resp = await groq.chat.completions.create({
        model: a.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 512,
      })
      const content = resp.choices[0]?.message?.content
      if (!content) throw new ParserError("Groq retornou vazio")
      return { model: a.model, content, durationMs: Date.now() - started }
    } catch (err) {
      lastErr = err
      if (!isRateLimited(err)) throw err
      // else loop; next attempt waits its delayMs
    }
  }

  throw new ParserError(
    "Groq está com rate limit. Tente de novo em alguns segundos.",
    lastErr,
  )
}

export async function parseTransaction(input: {
  rawInput: string
  categories: CategoryNode[]
  accounts: Account[]
  now?: Date
}): Promise<{ parsed: ParseResult; durationMs: number; model: string }> {
  const groq = getGroqClient()
  if (!groq) throw new ParserError("GROQ_API_KEY não configurada")

  const trimmed = input.rawInput.trim()
  if (!trimmed) throw new ParserError("Entrada vazia")

  const now = input.now ?? nowInSaoPaulo()
  const system = parserSystemPrompt({
    categories: input.categories,
    accounts: input.accounts,
    nowIso: now.toISOString(),
  })

  const { model, content, durationMs } = await completeWithRetry(
    groq,
    GROQ_MODELS.parser,
    system,
    trimmed,
  )

  let jsonParsed: unknown
  try {
    jsonParsed = JSON.parse(content)
  } catch (err) {
    throw new ParserError(
      `JSON inválido do Groq: ${content.slice(0, 200)}`,
      err,
    )
  }

  const validated = ParseResultSchema.safeParse(jsonParsed)
  if (!validated.success) {
    throw new ParserError(`Schema Zod falhou: ${validated.error.message}`)
  }

  return { parsed: validated.data, durationMs, model }
}

export async function transcribeAudio(audio: Blob): Promise<{
  text: string
  durationMs: number
  model: string
}> {
  const groq = getGroqClient()
  if (!groq) throw new ParserError("GROQ_API_KEY não configurada")

  const model = GROQ_MODELS.whisper
  const file = new File([audio], "audio.webm", { type: audio.type || "audio/webm" })

  // Whisper hits rate limits less often but when it does, one quick retry
  // almost always clears. Keeping it simple.
  let lastErr: unknown = null
  for (const delay of [0, 1500]) {
    if (delay > 0) await sleep(delay)
    try {
      const started = Date.now()
      const resp = await groq.audio.transcriptions.create({
        file,
        model,
        language: "pt",
        response_format: "verbose_json",
        temperature: 0,
      })
      const text = (resp as { text?: string }).text ?? ""
      if (!text.trim()) throw new ParserError("Whisper não retornou texto")
      return { text: text.trim(), durationMs: Date.now() - started, model }
    } catch (err) {
      lastErr = err
      if (!isRateLimited(err)) throw err
    }
  }
  throw new ParserError(
    "Whisper está com rate limit. Tente novamente em alguns segundos.",
    lastErr,
  )
}
