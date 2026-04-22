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

export const GROQ_MODELS = {
  chat: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
  parser: process.env.GROQ_PARSER_MODEL ?? "llama-3.3-70b-versatile",
  whisper: process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3",
} as const
