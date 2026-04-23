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

// Returns null when the user didn't name an account (or the name doesn't
// match any). Callers must handle null by parking the capture in review —
// we never silently dump unresolved rows into a default/last-used account,
// because that quietly corrupts the wrong balance.
export function resolveAccountId(
  hint: string | null,
  accounts: AccountRow[],
): string | null {
  if (!hint) return null
  const needle = normalize(hint)
  const match = accounts.find((a) => normalize(a.name).includes(needle))
  return match?.id ?? null
}
