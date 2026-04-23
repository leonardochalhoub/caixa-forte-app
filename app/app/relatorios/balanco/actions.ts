"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { fetchFipePrice, type FipeMetadata } from "@/lib/fipe"

const CreateSchema = z.object({
  period: z.string().min(1),
  section: z.string().min(1), // ex "passivo_nc" | "ativo_nc_investimento_renda_fixa"
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int(),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function createBalanceAdjustmentAction(
  input: z.infer<typeof CreateSchema>,
) {
  const user = await requireUser()
  const parsed = CreateSchema.parse(input)
  const supabase = await createServerClient()
  const lineKey = `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await untyped(supabase)
    .from("balance_adjustments")
    .insert({
      user_id: user.id,
      period: parsed.period,
      line_key: `${parsed.section}::${lineKey}`,
      label: parsed.label,
      amount_cents: parsed.amountCents,
      note: parsed.note ?? null,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
  return data
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int(),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function updateBalanceAdjustmentAction(
  input: z.infer<typeof UpdateSchema>,
) {
  const user = await requireUser()
  const parsed = UpdateSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await untyped(supabase)
    .from("balance_adjustments")
    .update({
      label: parsed.label,
      amount_cents: parsed.amountCents,
      note: parsed.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
}

export async function refreshFipeAdjustmentAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { data, error } = await untyped(supabase)
    .from("balance_adjustments")
    .select("id, metadata, label")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Linha não encontrada.")
  const meta = (data as { metadata?: FipeMetadata }).metadata
  if (!meta || meta.source !== "fipe") {
    throw new Error("Essa linha não tem origem FIPE.")
  }
  const price = await fetchFipePrice(meta)
  const newMeta: FipeMetadata = {
    ...meta,
    last_checked_at: new Date().toISOString(),
    last_reference_month: price.referenceMonth,
  }
  const { error: updErr } = await untyped(supabase)
    .from("balance_adjustments")
    .update({
      amount_cents: price.priceCents,
      metadata: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
  if (updErr) throw new Error(updErr.message)
  revalidatePath("/app/relatorios/balanco")
  return { price: price.price, referenceMonth: price.referenceMonth }
}

export async function deleteBalanceAdjustmentAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await untyped(supabase)
    .from("balance_adjustments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/relatorios/balanco")
}
