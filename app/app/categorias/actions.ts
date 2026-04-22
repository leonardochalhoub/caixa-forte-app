"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullable(),
  isIncome: z.boolean(),
  isFormalIncome: z.boolean(),
})

export async function createCategoryAction(
  input: z.infer<typeof CreateCategorySchema>,
): Promise<{ id: string }> {
  const user = await requireUser()
  const parsed = CreateCategorySchema.parse(input)
  const supabase = await createServerClient()

  // If it's a subcategory, inherit is_income from the parent so the two
  // sides never disagree (dashboard filters rely on this).
  let effectiveIsIncome = parsed.isIncome
  if (parsed.parentId) {
    const { data: parent } = await supabase
      .from("categories")
      .select("is_income")
      .eq("id", parsed.parentId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!parent) throw new Error("Categoria-pai não encontrada.")
    effectiveIsIncome = parent.is_income
  }

  // Put the new row at the end of its siblings. Postgres needs `.is(..., null)`
  // when filtering on a nullable column — `.eq(..., null)` silently matches
  // nothing.
  const siblingsQuery = supabase
    .from("categories")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
  const { data: siblings } = parsed.parentId
    ? await siblingsQuery.eq("parent_id", parsed.parentId)
    : await siblingsQuery.is("parent_id", null)
  const nextOrder = ((siblings?.[0]?.sort_order as number | undefined) ?? 0) + 1

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: parsed.name,
      parent_id: parsed.parentId,
      is_income: effectiveIsIncome,
      is_formal_income: parsed.isFormalIncome && effectiveIsIncome,
      sort_order: nextOrder,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  revalidatePath("/app/categorias")
  revalidatePath("/app")
  return { id: data.id }
}
