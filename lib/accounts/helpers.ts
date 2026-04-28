import { splitBankAndSub } from "@/lib/bank-taxonomy"
import type { AccountType } from "@/lib/types"

export type AccountListItem = {
  id: string
  name: string
  type: AccountType
  sort_order: number
  archived_at: string | null
  openingBalanceCents: number
  flowCents: number
  balanceCents: number
  balanceClassification?: "circulante" | "nao_circulante" | null
}

export const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta Corrente",
  credit: "Cartão",
  cash: "Dinheiro",
  wallet: "Carteira",
  savings: "Renda Fixa",
  investment: "Renda Variável",
  poupanca: "Poupança",
  crypto: "Cripto",
  fgts: "FGTS",
  ticket: "Vale-benefício",
}

export interface BankGroup {
  bank: string
  bankDisplay: string
  accounts: Array<AccountListItem & { subLabel: string | null }>
  totalBalanceCents: number
  isFgts: boolean
}

/**
 * FGTS accounts always get their own card (not grouped with the bank's
 * checking) because FGTS is a separate, locked asset class that doesn't
 * count toward the main balance.
 */
export function groupByBank(accounts: AccountListItem[]): BankGroup[] {
  const groups = new Map<string, BankGroup>()
  for (const a of accounts) {
    const { bank, sub } = splitBankAndSub(a.name)
    const isFgts = a.type === "fgts"
    const key = isFgts ? `${bank.toLowerCase()}::fgts` : bank.toLowerCase()
    const bankDisplay = isFgts ? `${bank} · FGTS` : bank
    const entry =
      groups.get(key) ?? {
        bank,
        bankDisplay,
        accounts: [],
        totalBalanceCents: 0,
        isFgts,
      }
    entry.accounts.push({ ...a, subLabel: sub })
    entry.totalBalanceCents += a.balanceCents
    groups.set(key, entry)
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isFgts !== b.isFgts) return a.isFgts ? 1 : -1
    return b.totalBalanceCents - a.totalBalanceCents
  })
}

export function defaultClassificationFor(
  type: AccountType,
): "circulante" | "nao_circulante" {
  return type === "fgts" ? "nao_circulante" : "circulante"
}
