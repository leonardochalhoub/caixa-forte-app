import type { Account, SeedClient } from "./types"

// Openings redistribuídas. Total líquido ~R$ 80k distribuído: checking baixo
// (2-3k), RF alta (25-35k), RV 6-10k, cripto 3-6k, poupança 6-9k. FGTS fora
// do líquido.
export const ACCOUNT_SEED = [
  {
    name: "Nubank Conta",
    type: "checking",
    opening_balance_cents: 280000,
    sort_order: 0,
    balance_classification: "circulante" as string | null,
  },
  {
    name: "Nubank Renda Fixa",
    type: "investment",
    opening_balance_cents: 2800000,
    sort_order: 1,
    balance_classification: "circulante" as string | null,
  },
  {
    name: "Nubank Renda Variável",
    type: "investment",
    opening_balance_cents: 750000,
    sort_order: 2,
    balance_classification: "circulante" as string | null,
  },
  {
    name: "Nubank Cripto",
    type: "crypto",
    opening_balance_cents: 420000,
    sort_order: 3,
    balance_classification: "circulante" as string | null,
  },
  {
    name: "Caixa Poupança",
    type: "savings",
    opening_balance_cents: 680000,
    sort_order: 4,
    balance_classification: "circulante" as string | null,
  },
  {
    name: "Caixa FGTS",
    type: "fgts",
    opening_balance_cents: 4200000,
    sort_order: 5,
    balance_classification: "nao_circulante" as string | null,
  },
  {
    name: "Nubank Cartão",
    type: "credit",
    opening_balance_cents: 0,
    sort_order: 6,
    balance_classification: null as string | null,
  },
]

export async function seedAccounts(
  sb: SeedClient,
  userId: string,
): Promise<{ accountsByName: Record<string, Account>; count: number }> {
  const { data: insertedAccs, error: accErr } = await sb
    .from("accounts")
    .insert(ACCOUNT_SEED.map((a) => ({ ...a, user_id: userId })))
    .select("id, name, type")
  if (accErr) throw new Error(`accounts: ${accErr.message}`)
  const accountsByName: Record<string, Account> = {}
  for (const a of insertedAccs ?? []) {
    accountsByName[a.name as string] = {
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
    }
  }
  return { accountsByName, count: insertedAccs?.length ?? 0 }
}
