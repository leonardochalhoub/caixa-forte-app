// Queries Supabase do dashboard (`/app`). Extraídas de page.tsx pra
// manter o Server Component enxuto. Cada função recebe um cliente já
// instanciado + userId e devolve um shape tipado.

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AccountRow,
  CardCalcTx,
  CategoryRow,
  ExpenseTxRow,
  FlowTxRow,
  MonthTxRow,
  PendingCaptureRow,
  RecentTxRow,
  UpcomingTxRow,
} from "./types"

type AnySupabase = SupabaseClient<any, any, any>

export type DashboardCoreData = {
  monthTx: MonthTxRow[]
  recentTx: RecentTxRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  flowRealized: FlowTxRow[]
  upcomingTx: UpcomingTxRow[]
  pendingCaptures: PendingCaptureRow[]
}

/**
 * Carrega em paralelo as 7 queries-base que alimentam o dashboard
 * autenticado. Range de `monthTx` é os últimos 12 meses (start do
 * slot mais antigo). `recentTx` é cap de 100 — depois filtramos
 * cartões e cortamos pra 50 no client.
 *
 * `flowRealized` traz TODAS as tx (com e sem paid_at) + account_id.
 * Depois separamos: contas não-cartão usam só paid_at não-nulo;
 * cartão de crédito usa tudo (charge é dívida desde o swipe).
 */
export async function fetchDashboardCore(
  supabase: AnySupabase,
  userId: string,
  oldestStart: string,
): Promise<DashboardCoreData> {
  const [
    { data: monthTx },
    { data: recentTx },
    { data: accountsRaw },
    { data: categories },
    { data: flowRealized },
    { data: upcomingTx },
    { data: pendingCaptures },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "type, amount_cents, occurred_on, category_id, is_transfer, account_id, paid_at, merchant",
      )
      .eq("user_id", userId)
      .gte("occurred_on", oldestStart),
    // "Últimas transações" no dashboard só mostra movimentações das
    // contas normais. Tx em cartão de crédito (charges) ficam dentro
    // da fatura em /app/cartoes — não aparecem aqui pra não poluir.
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, needs_review, account_id, category_id, created_at, paid_at",
      )
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents, closing_day")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("categories")
      .select("id, name, is_income, parent_id, is_formal_income")
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("account_id, type, amount_cents, paid_at, is_transfer, tx_kind")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, account_id, category_id",
      )
      .eq("user_id", userId)
      .is("paid_at", null)
      .order("occurred_on", { ascending: true })
      .limit(20),
    supabase
      .from("capture_messages")
      .select("id, channel, raw_input, groq_parse_json, created_at")
      .eq("user_id", userId)
      .eq("error", "no_account")
      .is("transaction_id", null)
      .order("created_at", { ascending: true })
      .limit(20),
  ])

  return {
    monthTx: (monthTx ?? []) as MonthTxRow[],
    recentTx: (recentTx ?? []) as RecentTxRow[],
    accounts: (accountsRaw ?? []) as AccountRow[],
    categories: (categories ?? []) as CategoryRow[],
    flowRealized: (flowRealized ?? []) as FlowTxRow[],
    upcomingTx: (upcomingTx ?? []) as UpcomingTxRow[],
    pendingCaptures: (pendingCaptures ?? []) as PendingCaptureRow[],
  }
}

/**
 * Tx de despesa (qualquer conta) — usado pra detectar lump-sums de
 * fatura agendados em conta corrente (merchant tipo "Nubank Cartão
 * Abril 2026"). Filtro server-side em type=expense.
 */
export async function fetchAllExpenseTx(
  supabase: AnySupabase,
  userId: string,
): Promise<ExpenseTxRow[]> {
  const { data } = await supabase
    .from("transactions")
    .select("account_id, type, amount_cents, merchant, paid_at, is_transfer, tx_kind")
    .eq("user_id", userId)
    .eq("type", "expense")
  return (data ?? []) as ExpenseTxRow[]
}

/**
 * Tx rica (com merchant + occurred_on) usada pra calcular openCents
 * real por fatura, respeitando closing_day. Mesma fonte do
 * /app/cartoes.
 */
export async function fetchCardCalcTxs(
  supabase: AnySupabase,
  userId: string,
): Promise<CardCalcTx[]> {
  const { data } = await supabase
    .from("transactions")
    .select(
      "account_id, type, amount_cents, occurred_on, merchant, paid_at, is_transfer, tx_kind",
    )
    .eq("user_id", userId)
  return (data ?? []) as CardCalcTx[]
}

/**
 * Localização (city_name + uf) usada pelo widget ClockWeather.
 * Tolerante a colunas inexistentes (migration 0017).
 */
export async function fetchUserLocation(
  supabase: AnySupabase,
  userId: string,
): Promise<{ cityName: string | null; uf: string | null }> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("city_name, uf")
      .eq("user_id", userId)
      .maybeSingle()
    return {
      cityName: (data as { city_name?: string | null } | null)?.city_name ?? null,
      uf: (data as { uf?: string | null } | null)?.uf ?? null,
    }
  } catch {
    return { cityName: null, uf: null }
  }
}
