import type { AccountType } from "@/lib/types"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { TransactionsTable } from "./_components/TransactionsTable"

export default async function TransacoesPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const [{ data: transactions }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, needs_review, account_id, category_id",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("accounts").select("id, name, type").order("sort_order"),
    supabase.from("categories").select("id, name, is_income, parent_id").order("sort_order"),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-strong">Transações</h1>
      <TransactionsTable
        transactions={
          (transactions ?? []).map((t) => ({
            ...t,
            type: t.type as "income" | "expense",
            needs_review: t.needs_review ?? false,
          }))
        }
        accounts={(accounts ?? []).map((a) => ({ ...a, type: a.type as AccountType }))}
        categories={categories ?? []}
      />
    </div>
  )
}
