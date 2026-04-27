// Queries Supabase do Relatório de Conciliação. Cada função recebe o
// client + userId e devolve dados crus (raw); o helpers cuida de
// transformação. Mantém a page.tsx fina.

import type { createServerClient } from "@/lib/supabase/server"
import type { AccountRow, PendingParsed, Tx } from "./conciliacao-types"

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>

export type ConciliacaoData = {
  accounts: AccountRow[]
  allTxRaw: Tx[]
  pendingRaw: { id: string; groq_parse_json: unknown }[]
  profileRaw: { display_name: string | null } | null
}

export async function fetchConciliacaoData(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ConciliacaoData> {
  const [
    { data: accounts },
    { data: allTxRaw },
    { data: pendingRaw },
    { data: profileRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents, created_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
    // Fetch TODAS as tx (paid e unpaid). Filtro por account type acontece
    // depois: não-cartão só conta paid; cartão conta tudo (debt).
    supabase
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, created_at, merchant, is_transfer, category_id",
      )
      .eq("user_id", userId)
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("capture_messages")
      .select("id, groq_parse_json")
      .eq("user_id", userId)
      .eq("error", "no_account")
      .is("transaction_id", null),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  return {
    accounts: (accounts ?? []) as AccountRow[],
    allTxRaw: (allTxRaw ?? []) as Tx[],
    pendingRaw: (pendingRaw ?? []) as { id: string; groq_parse_json: unknown }[],
    profileRaw: profileRaw as { display_name: string | null } | null,
  }
}

// Normaliza `capture_messages.groq_parse_json` em `PendingParsed[]`,
// descartando linhas mal formadas. Mantido aqui pra ficar perto da
// query que produz o raw.
export function parsePendingCaptures(
  pendingRaw: { id: string; groq_parse_json: unknown }[],
): PendingParsed[] {
  return pendingRaw
    .map((c) => {
      const p = c.groq_parse_json as {
        amount_cents?: number
        type?: "income" | "expense"
        occurred_on?: string
        merchant?: string | null
      } | null
      if (
        !p ||
        typeof p.amount_cents !== "number" ||
        (p.type !== "income" && p.type !== "expense") ||
        typeof p.occurred_on !== "string"
      ) {
        return null
      }
      return {
        id: c.id,
        amount_cents: p.amount_cents,
        type: p.type,
        occurred_on: p.occurred_on,
        merchant: p.merchant ?? null,
      }
    })
    .filter((x): x is PendingParsed => x !== null)
}
