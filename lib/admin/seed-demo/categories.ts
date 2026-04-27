import type { Category, SeedClient } from "./types"

export const CATEGORY_SEED = [
  { name: "Moradia", icon: "🏠", is_income: false, is_formal_income: false, sort_order: 0 },
  { name: "Alimentação", icon: "🍽️", is_income: false, is_formal_income: false, sort_order: 1 },
  { name: "Mercado", icon: "🛒", is_income: false, is_formal_income: false, sort_order: 2 },
  { name: "Transporte", icon: "🚗", is_income: false, is_formal_income: false, sort_order: 3 },
  { name: "Saúde", icon: "💊", is_income: false, is_formal_income: false, sort_order: 4 },
  { name: "Lazer", icon: "🎬", is_income: false, is_formal_income: false, sort_order: 5 },
  { name: "Assinaturas", icon: "📺", is_income: false, is_formal_income: false, sort_order: 6 },
  { name: "Cuidados Pessoais", icon: "💅", is_income: false, is_formal_income: false, sort_order: 7 },
  { name: "Salário", icon: "💼", is_income: true, is_formal_income: true, sort_order: 8 },
  { name: "Freelance", icon: "💻", is_income: true, is_formal_income: true, sort_order: 9 },
  { name: "Rendimentos", icon: "📈", is_income: true, is_formal_income: false, sort_order: 10 },
]

export async function seedCategories(
  sb: SeedClient,
  userId: string,
): Promise<{ categoriesByName: Record<string, Category>; count: number }> {
  const { data: insertedCats, error: catErr } = await sb
    .from("categories")
    .insert(CATEGORY_SEED.map((c) => ({ ...c, user_id: userId })))
    .select("id, name")
  if (catErr) throw new Error(`categories: ${catErr.message}`)
  const categoriesByName: Record<string, Category> = {}
  for (const c of insertedCats ?? []) {
    categoriesByName[c.name as string] = {
      id: c.id as string,
      name: c.name as string,
    }
  }
  return { categoriesByName, count: insertedCats?.length ?? 0 }
}
