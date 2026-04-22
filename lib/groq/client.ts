import Groq from "groq-sdk"

let cached: Groq | null = null

/**
 * Returns a Groq SDK client or null if GROQ_API_KEY is not configured.
 * Callers must handle the null case (typically with a fallback).
 */
export function getGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null
  if (!cached) cached = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return cached
}

// Model defaults tuned for Groq's free-tier rate limits:
//   • parser  — llama-3.1-8b-instant: ~5× the TPM headroom of 70b,
//               plenty of quality for the structured JSON extraction.
//   • chat    — llama-3.3-70b-versatile: prose quality matters for the
//               trend explainer so we keep the bigger model here.
//   • whisper — speech-to-text, only model that makes sense.
// Override any via env if throughput needs shift.
export const GROQ_MODELS = {
  chat: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
  parser: process.env.GROQ_PARSER_MODEL ?? "llama-3.1-8b-instant",
  whisper: process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3",
} as const
