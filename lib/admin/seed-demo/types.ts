import type { SupabaseClient } from "@supabase/supabase-js"

// Cliente Supabase compartilhado entre os módulos do seed-demo. Usamos
// o tipo aberto pra não acoplar com o Database gerado.
export type SeedClient = SupabaseClient

export type SeedLog = { step: string; detail: string; ok: boolean }

export type RangeKey = "full" | "2025" | "2026" | "q1-2026" | "last-12m"

export type Account = { id: string; name: string; type: string }
export type Category = { id: string; name: string }

export type TxPayload = {
  user_id: string
  account_id: string
  category_id: string | null
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string
  is_transfer: boolean
  source: string
}

// Eventos pontuais (não recorrentes). Cada um tem uma probabilidade
// de acontecer no mês + faixa de valor + descrição.
export type OneOffEvent = {
  chance: number
  label: string
  category: string
  min: number
  max: number
  account?: string // default Nubank Conta
  isIncome?: boolean
}

export type City = { city: string; uf: string; lat: number; lng: number }

export type SeedNote = (step: string, detail: string, ok?: boolean) => void
