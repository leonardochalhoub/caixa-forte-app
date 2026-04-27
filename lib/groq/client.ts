// DEPRECATED: este módulo é re-export do novo provider abstrato em
// @/lib/llm/provider. Foi mantido pra evitar quebra durante migração;
// novos imports devem usar @/lib/llm/provider diretamente.

import { getLLMClient, LLM_MODELS } from "@/lib/llm/provider"

export const getGroqClient = getLLMClient
export const GROQ_MODELS = {
  chat: LLM_MODELS.chat,
  parser: LLM_MODELS.parser,
  whisper: LLM_MODELS.whisper,
} as const
