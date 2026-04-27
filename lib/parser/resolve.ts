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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Returns null when the user didn't name an account (or the hint doesn't
// match any). Callers must handle null by parking the capture in review —
// we never silently dump unresolved rows into a default/last-used account,
// because that quietly corrupts the wrong balance.
//
// O prompt instrui o LLM a retornar o UUID (entre colchetes na lista de
// contas). Se vier UUID válido, match direto por id. Senão, cai pro
// fuzzy match bidirecional como fallback (proteção contra LLM que ignora
// instrução). Fuzzy match exige needle ≥ 4 chars pra evitar one-word
// false positives (ex: "caixa" matchando "Caixa Federal Cartão" quando
// usuário disse "mercado pago").
export function resolveAccountId(
  hint: string | null,
  accounts: AccountRow[],
): string | null {
  if (!hint) return null
  const trimmed = hint.trim()

  // Caminho 1: hint é UUID direto (formato esperado após prompt v2)
  if (UUID_RE.test(trimmed)) {
    const byId = accounts.find((a) => a.id.toLowerCase() === trimmed.toLowerCase())
    return byId?.id ?? null
  }

  // Caminho 2: fallback fuzzy. Bidirecional: needle ⊂ name OU name ⊂ needle.
  const needle = normalize(trimmed)
  if (needle.length < 4) return null // 1-3 chars matcha qualquer coisa
  const match = accounts.find((a) => {
    const n = normalize(a.name)
    return n.includes(needle) || needle.includes(n)
  })
  return match?.id ?? null
}
