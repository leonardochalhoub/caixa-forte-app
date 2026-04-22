import type { ParseResult } from "./schema"

export interface CategoryRow {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
}

export interface AccountRow {
  id: string
  name: string
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

export function resolveCategoryId(
  parsed: Pick<ParseResult, "category_name" | "subcategory_name" | "type">,
  categories: CategoryRow[],
): string | null {
  const wantedIncome = parsed.type === "income"
  const parents = categories.filter((c) => c.parent_id === null)
  const parentMatch = parents.find(
    (p) => normalize(p.name) === normalize(parsed.category_name),
  )

  if (!parentMatch) {
    // Fallback: match any category (parent or child) by name
    const any = categories.find((c) => normalize(c.name) === normalize(parsed.category_name))
    if (!any) return null
    return any.id
  }

  if (!parsed.subcategory_name) return parentMatch.id

  const children = categories.filter((c) => c.parent_id === parentMatch.id)
  const childMatch = children.find(
    (c) => normalize(c.name) === normalize(parsed.subcategory_name!),
  )
  // If child match requested but not found, fall back to parent
  return childMatch?.id ?? parentMatch.id
}

export function resolveAccountId(
  hint: string | null,
  accounts: AccountRow[],
  lastUsedId?: string | null,
): string | null {
  if (hint) {
    const match = accounts.find((a) => normalize(a.name).includes(normalize(hint)))
    if (match) return match.id
  }
  if (lastUsedId && accounts.some((a) => a.id === lastUsedId)) return lastUsedId
  return accounts[0]?.id ?? null
}
