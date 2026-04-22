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

// Model defaults:
//   • parser  — llama-3.3-70b-versatile: higher accuracy on our structured
//               JSON extraction prompt (which includes dozens of categories
//               and accounts). 8B was dropping fields / malforming JSON on
//               real prompts, breaking Zod validation.
//   • chat    — llama-3.3-70b-versatile: prose quality on trend explainer.
//   • whisper — speech-to-text.
// Retry/fallback in parseTransaction demotes to 8B on 429 only, never
// as the primary call.
export const GROQ_MODELS = {
  chat: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
  parser: process.env.GROQ_PARSER_MODEL ?? "llama-3.3-70b-versatile",
  whisper: process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3",
} as const
