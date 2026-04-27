// Queries Supabase do Balanço Contábil. Extraídas do god-file
// app/relatorios/balanco/page.tsx pra deixar a página fina e permitir
// que cada fetch seja testável/refeita isoladamente.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type {
  AccountRow,
  AdjRow,
  RegistryRow,
  Tx,
} from "./balanco-types"

type Client = SupabaseClient<Database>

export type ProfileRow = {
  display_name: string | null
}

// Carrega contas, transações, profile e ajustes do período em paralelo.
// As 4 queries não dependem entre si — antes ficavam num Promise.all
// inline na page; aqui ficam tipadas e nomeadas.
export async function fetchBalancoCore(
  supabase: Client,
  userId: string,
  periodStr: string,
): Promise<{
  accounts: AccountRow[]
  txs: Tx[]
  profile: ProfileRow | null
  adjustments: AdjRow[]
}> {
  const [
    { data: accounts },
    { data: txsRaw },
    { data: profileRaw },
    { data: adjustmentsRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents, balance_classification")
      .eq("user_id", userId)
      .is("archived_at", null),
    // Sem filtro de occurred_on — dívida de cartão precisa de todas
    // as tx não pagas independente da data (source of truth alinhado
    // com /app/cartoes). Filtros por data acontecem no código que
    // de fato precisa deles (overdueLiabilities, FIPE, etc).
    supabase
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer",
      )
      .eq("user_id", userId),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("balance_adjustments")
      .select("id, period, line_key, label, amount_cents, note, metadata")
      .eq("user_id", userId)
      .eq("period", periodStr),
  ])

  return {
    accounts: (accounts ?? []) as AccountRow[],
    txs: (txsRaw ?? []) as Tx[],
    profile: (profileRaw ?? null) as ProfileRow | null,
    adjustments: (adjustmentsRaw ?? []) as AdjRow[],
  }
}

// Histórico de partidas dobradas registradas pelo user no período
// (separado porque é exibido em listagem própria no rodapé).
export async function fetchBalancoRegistries(
  supabase: Client,
  userId: string,
  periodStr: string,
): Promise<RegistryRow[]> {
  const { data: registriesRaw } = await supabase
    .from("balance_registries")
    .select(
      "id, period, kind, description, amount_cents, debit_section, debit_label, credit_section, credit_label, note, created_at",
    )
    .eq("user_id", userId)
    .eq("period", periodStr)
    .order("created_at", { ascending: false })
  return (registriesRaw ?? []) as RegistryRow[]
}
