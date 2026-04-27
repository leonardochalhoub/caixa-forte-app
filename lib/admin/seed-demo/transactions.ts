import { buildMonthTxs } from "./build-month-tx"
import type { Account, Category, SeedClient, SeedNote, TxPayload } from "./types"

// Re-exports pra preservar a API pública anterior do módulo. Antes da
// refatoração, esse arquivo concentrava ONEOFF_EVENTS + buildMonthTxs +
// seedTransactions. Agora cada um vive em seu sub-módulo.
export { buildMonthTxs } from "./build-month-tx"
export { ONEOFF_EVENTS } from "./oneoff-events"

// Entry point do seed de transações: itera os meses pedidos, gera as
// tx via buildMonthTxs e persiste em batches de 100 (limite seguro pro
// Supabase). Erros de batch viram nota mas não abortam o seed inteiro.
export async function seedTransactions(
  sb: SeedClient,
  userId: string,
  months: string[],
  accountsByName: Record<string, Account>,
  categoriesByName: Record<string, Category>,
  r: () => number,
  note: SeedNote,
): Promise<{ inserted: number; total: number }> {
  const today = new Date()
  const allTxs: TxPayload[] = []
  for (const ym of months) {
    allTxs.push(
      ...buildMonthTxs(userId, ym, accountsByName, categoriesByName, today, r),
    )
  }
  let txInserted = 0
  for (let i = 0; i < allTxs.length; i += 100) {
    const batch = allTxs.slice(i, i + 100)
    const { error } = await sb.from("transactions").insert(batch)
    if (error) {
      note("tx-batch", `${i}: ${error.message}`, false)
      continue
    }
    txInserted += batch.length
  }
  return { inserted: txInserted, total: allTxs.length }
}
