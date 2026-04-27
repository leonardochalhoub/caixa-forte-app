// Caixa Forte — LLM provider abstraction
//
// Conselho (the-planner) flagged: lock-in implícito em Groq. API key
// única, sem indireção. Se Groq mudar pricing/modelo/desligar, parser
// quebra em 5 lugares.
//
// Este módulo é o ÚNICO ponto que importa groq-sdk. Callsites usam
// getLLMClient() + LLM_MODELS daqui. Quando precisar trocar provider:
//   1. Implementar o mesmo shape (chat.completions.create, audio.transcriptions.create)
//      via outro SDK ou fetch direto
//   2. Selecionar via LLM_PROVIDER env var
//
// Hoje só temos 'groq', mas a indireção evita refactor distribuído.

import Groq from "groq-sdk"

const PROVIDER = (process.env.LLM_PROVIDER ?? "groq").toLowerCase()

let cachedGroq: Groq | null = null

function buildGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null
  if (!cachedGroq) cachedGroq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return cachedGroq
}

// Returns the LLM SDK client or null when no API key is configured.
// Callers must handle null (typically with a fallback or error).
//
// Tipo de retorno é Groq por enquanto — quando outros providers
// entrarem com shape compatível, abstrair via interface explícita.
export function getLLMClient(): Groq | null {
  switch (PROVIDER) {
    case "groq":
      return buildGroqClient()
    default:
      throw new Error(
        `LLM_PROVIDER='${PROVIDER}' não suportado. Aceitos: groq.`,
      )
  }
}

// Modelos canônicos do app, mapeados pro provider ativo.
// Override por env var.
export const LLM_MODELS = {
  chat: process.env.LLM_CHAT_MODEL
    ?? process.env.GROQ_CHAT_MODEL
    ?? "llama-3.3-70b-versatile",
  parser: process.env.LLM_PARSER_MODEL
    ?? process.env.GROQ_PARSER_MODEL
    ?? "llama-3.3-70b-versatile",
  whisper: process.env.LLM_WHISPER_MODEL
    ?? process.env.GROQ_WHISPER_MODEL
    ?? "whisper-large-v3",
  // Fallback model usado quando o primário rate-limita (429).
  parserFallback: process.env.LLM_PARSER_FALLBACK_MODEL
    ?? "llama-3.1-8b-instant",
} as const

// Endpoint REST do provider — necessário pra rotas que fazem fetch
// direto (streaming, controle granular de retry). O cliente SDK
// usa internamente a mesma URL base.
export const LLM_ENDPOINT = (() => {
  switch (PROVIDER) {
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions"
    default:
      return ""
  }
})()

export const LLM_API_KEY_ENV = (() => {
  switch (PROVIDER) {
    case "groq":
      return "GROQ_API_KEY"
    default:
      return ""
  }
})()

export function getLLMApiKey(): string | undefined {
  return process.env[LLM_API_KEY_ENV]
}
