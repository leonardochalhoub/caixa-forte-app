"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { AccountType } from "@/lib/types"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { generateCategoriesFromDescription } from "@/lib/categories/generator"

const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum([
    "checking",
    "credit",
    "cash",
    "wallet",
    "savings",
    "investment",
    "poupanca",
    "crypto",
    "fgts",
  ]),
})

export async function createAccountAction(input: z.infer<typeof CreateAccountSchema>) {
  const user = await requireUser()
  const parsed = CreateAccountSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, name: parsed.name, type: parsed.type })
    .select("id, name, type")
    .single()
  if (error) throw new Error(`Erro ao criar conta: ${error.message}`)

  revalidatePath("/onboarding")
  revalidatePath("/app")
  return { ...data, type: data.type as AccountType }
}

export async function deleteAccountAction(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/onboarding")
}

const GenerateCategoriesSchema = z.object({
  description: z.string().trim().max(4000),
})

export async function generateCategoriesAction(
  input: z.infer<typeof GenerateCategoriesSchema>,
): Promise<{ created: number; source: "groq" | "fallback" }> {
  const user = await requireUser()
  const parsed = GenerateCategoriesSchema.parse(input)
  const supabase = await createServerClient()

  const { data: existing } = await supabase
    .from("categories")
    .select("id", { head: false })
    .eq("user_id", user.id)
    .limit(1)

  if (existing && existing.length > 0) {
    return { created: 0, source: "groq" }
  }

  const { categories, source } = await generateCategoriesFromDescription(parsed.description)

  const parentInserts = categories.map((c, i) => ({
    user_id: user.id,
    name: c.name,
    is_income: c.is_income,
    sort_order: i + 1,
  }))

  const { data: parents, error: parentErr } = await supabase
    .from("categories")
    .insert(parentInserts)
    .select("id, name")

  if (parentErr) throw new Error(`Erro ao criar categorias: ${parentErr.message}`)
  if (!parents) throw new Error("Nenhuma categoria pai retornada")

  const parentMap = new Map(parents.map((p) => [p.name, p.id]))
  const childInserts: Array<{
    user_id: string
    parent_id: string
    name: string
    is_income: boolean
    sort_order: number
  }> = []
  for (const cat of categories) {
    const parentId = parentMap.get(cat.name)
    if (!parentId) continue
    cat.children.forEach((childName, idx) => {
      childInserts.push({
        user_id: user.id,
        parent_id: parentId,
        name: childName,
        is_income: cat.is_income,
        sort_order: idx + 1,
      })
    })
  }

  let childrenCreated = 0
  if (childInserts.length > 0) {
    const { data: children, error: childErr } = await supabase
      .from("categories")
      .insert(childInserts)
      .select("id")
    if (childErr) throw new Error(`Erro ao criar subcategorias: ${childErr.message}`)
    childrenCreated = children?.length ?? 0
  }

  revalidatePath("/onboarding")
  revalidatePath("/app/categorias")
  return { created: parents.length + childrenCreated, source }
}

const FinishOnboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
})

export async function finishOnboardingAction(input: z.infer<typeof FinishOnboardingSchema>) {
  const user = await requireUser()
  const parsed = FinishOnboardingSchema.parse(input)
  const supabase = await createServerClient()

  const { data: accountsList, error: listError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .is("archived_at", null)

  if (listError) throw new Error(listError.message)
  if (!accountsList || accountsList.length === 0) {
    throw new Error("Crie pelo menos uma conta antes de finalizar.")
  }

  const { data: categoriesList, error: catErr } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)

  if (catErr) throw new Error(catErr.message)
  if (!categoriesList || categoriesList.length === 0) {
    throw new Error("Gere suas categorias antes de finalizar.")
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.displayName, onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)

  redirect("/app")
}
