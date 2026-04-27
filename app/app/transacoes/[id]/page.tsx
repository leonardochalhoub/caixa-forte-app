import { notFound } from "next/navigation"
import type { AccountType } from "@/lib/types"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { EditTransaction } from "./_components/EditTransaction"

export default async function TransactionDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const [{ data: tx }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, account_id, category_id, source, needs_review, raw_input, paid_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("accounts").select("id, name, type").order("sort_order"),
    supabase.from("categories").select("id, name, is_income, parent_id").order("sort_order"),
  ])

  if (!tx) notFound()

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold text-strong">Editar transação</h1>
      <EditTransaction
        transaction={{
          id: tx.id as string,
          type: tx.type as "income" | "expense",
          amount_cents: Number(tx.amount_cents),
          occurred_on: tx.occurred_on as string,
          merchant: (tx.merchant as string | null) ?? null,
          note: (tx.note as string | null) ?? null,
          account_id: tx.account_id as string,
          category_id: (tx.category_id as string | null) ?? null,
          source: (tx.source as string) ?? "manual",
          raw_input: (tx.raw_input as string | null) ?? null,
          paid_at: (tx.paid_at as string | null) ?? null,
        }}
        accounts={(accounts ?? []).map((a) => ({ ...a, type: a.type as AccountType }))}
        categories={categories ?? []}
      />
    </div>
  )
}
