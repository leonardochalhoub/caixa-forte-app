import type { AccountType } from "@/lib/types"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { AccountsManager } from "./_components/AccountsManager"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ContasPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type, sort_order, archived_at, opening_balance_cents")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })

  // Balance = opening + sum of paid (settled) transactions. Scheduled/
  // unpaid transactions stay off the balance until paid_at is set.
  const { data: flows } = await supabase
    .from("transactions")
    .select("account_id, type, amount_cents")
    .eq("user_id", user.id)
    .not("paid_at", "is", null)

  const flowMap = new Map<string, number>()
  for (const tx of flows ?? []) {
    const delta = tx.type === "income" ? Number(tx.amount_cents) : -Number(tx.amount_cents)
    flowMap.set(tx.account_id, (flowMap.get(tx.account_id) ?? 0) + delta)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-strong">Contas</h1>
      <AccountsManager
        accounts={(accounts ?? []).map((a) => ({
          ...a,
          type: a.type as AccountType,
          openingBalanceCents: Number(a.opening_balance_cents ?? 0),
          flowCents: flowMap.get(a.id) ?? 0,
          balanceCents:
            Number(a.opening_balance_cents ?? 0) + (flowMap.get(a.id) ?? 0),
        }))}
      />
    </div>
  )
}
