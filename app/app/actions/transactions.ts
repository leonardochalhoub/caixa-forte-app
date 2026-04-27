"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  resolvePaidAt,
} from "./shared"

export async function createTransactionAction(input: z.infer<typeof CreateTransactionSchema>) {
  const user = await requireUser()
  const parsed = CreateTransactionSchema.parse(input)
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const paidAt = resolvePaidAt(parsed.occurredOn, parsed.paid, today)

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      type: parsed.type,
      amount_cents: parsed.amountCents,
      occurred_on: parsed.occurredOn,
      merchant: parsed.merchant,
      note: parsed.note,
      source: "manual",
      paid_at: paidAt,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar transação: ${error.message}`)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")
  return data
}

export async function updateTransactionAction(input: z.infer<typeof UpdateTransactionSchema>) {
  const user = await requireUser()
  const parsed = UpdateTransactionSchema.parse(input)
  const supabase = await createServerClient()

  // Only touch paid_at when the caller explicitly passes `paid`. That way
  // renaming a merchant on an already-paid tx doesn't accidentally unset
  // or reset the paid_at timestamp.
  const update: {
    account_id: string
    category_id: string | null
    type: "income" | "expense"
    amount_cents: number
    occurred_on: string
    merchant: string | null
    note: string | null
    paid_at?: string | null
  } = {
    account_id: parsed.accountId,
    category_id: parsed.categoryId,
    type: parsed.type,
    amount_cents: parsed.amountCents,
    occurred_on: parsed.occurredOn,
    merchant: parsed.merchant,
    note: parsed.note,
  }
  if (parsed.paid === true) update.paid_at = new Date().toISOString()
  if (parsed.paid === false) update.paid_at = null

  const { data, error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", parsed.id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar: ${error.message}`)

  revalidatePath("/app")
  revalidatePath("/app/transacoes")
  revalidatePath(`/app/transacoes/${parsed.id}`)
  return data
}

export async function deleteTransactionAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app")
  revalidatePath("/app/transacoes")
}
