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
  const nowIso = now.toISOString()
  const system = parserSystemPrompt({
    categories: input.categories,
    accounts: input.accounts,
    nowIso,
  })

  const started = Date.now()
  const model = GROQ_MODELS.parser

  const resp = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: trimmed },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 512,
  })

  const durationMs = Date.now() - started
  const raw = resp.choices[0]?.message?.content
  if (!raw) throw new ParserError("Groq retornou vazio")

  let jsonParsed: unknown
  try {
    jsonParsed = JSON.parse(raw)
  } catch (err) {
    throw new ParserError(`JSON inválido do Groq: ${raw.slice(0, 200)}`, err)
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
  const started = Date.now()
  const file = new File([audio], "audio.webm", { type: audio.type || "audio/webm" })
  const resp = await groq.audio.transcriptions.create({
    file,
    model,
    language: "pt",
    response_format: "verbose_json",
    temperature: 0,
  })
  const durationMs = Date.now() - started
  const text = (resp as { text?: string }).text ?? ""
  if (!text.trim()) throw new ParserError("Whisper não retornou texto")
  return { text: text.trim(), durationMs, model }
}
