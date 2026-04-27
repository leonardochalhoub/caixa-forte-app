// Queries Supabase do Relatório DRE. Cada função recebe o client + userId
// e devolve dados crus; o helpers cuida de transformação. Mantém a
// page.tsx fina.

import type { createServerClient } from "@/lib/supabase/server"
import type { AccountRow, CategoryRow, Tx } from "./dre-types"

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>

export type DREData = {
  accounts: AccountRow[]
  txsRaw: Tx[]
  catsRaw: CategoryRow[]
  profileRaw: { display_name: string | null } | null
}

export async function fetchDREData(
  supabase: SupabaseServerClient,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<DREData> {
  const [
    { data: accounts },
    { data: txsRaw },
    { data: catsRaw },
    { data: profileRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, category_id",
      )
      .eq("user_id", userId)
      .gte("occurred_on", periodStart)
      .lt("occurred_on", periodEnd),
    supabase
      .from("categories")
      .select("id, name, parent_id, is_income, is_formal_income")
      .eq("user_id", userId),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  return {
    accounts: (accounts ?? []) as AccountRow[],
    txsRaw: (txsRaw ?? []) as Tx[],
    catsRaw: (catsRaw ?? []) as CategoryRow[],
    profileRaw: profileRaw as { display_name: string | null } | null,
  }
}

// Busca todas as occurred_on do user (lightweight, só uma coluna) pra
// montar dropdown de períodos disponíveis.
export async function fetchAllOccurredOn(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("transactions")
    .select("occurred_on")
    .eq("user_id", userId)
  return ((data ?? []) as { occurred_on: string }[]).map((t) => t.occurred_on)
}
