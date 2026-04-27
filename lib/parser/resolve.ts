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

// Tokens significativos: ≥4 chars, normalizado, sem stop-words ("de",
// "do", "da", "cartao", "conta"). Usado pelo matching token-level.
const STOP_TOKENS = new Set([
  "de", "do", "da", "dos", "das", "e",
  "cartao", "conta", "banco",
])
function tokenize(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t))
}

// Returns null when the user didn't name an account (or the hint doesn't
// match any). Callers must handle null by parking the capture in review —
// we never silently dump unresolved rows into a default/last-used account,
// because that quietly corrupts the wrong balance.
//
// O prompt instrui o LLM a retornar o UUID (entre colchetes na lista de
// contas). Se vier UUID válido, match direto por id. Senão:
//
// 1. Substring bidirecional (needle ⊂ name OU name ⊂ needle) — caminho
//    rápido pra hints como "nubank cartão" → "Nubank Cartão".
// 2. Token-level intersection — destrava "Caixa Federal" → "Caixa
//    Econômica Federal" (precisa ≥1 token significativo casando, e
//    desempata pelo número total de tokens compartilhados).
//
// Stop-words ("de", "do", "cartao") são filtradas pra não inflar score
// genérico. Tokens precisam ter ≥4 chars (one-word como "nu" não conta).
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

  const needle = normalize(trimmed)
  if (needle.length < 4) return null

  // Caminho 2a: substring bidirecional (rápido, cobre hints inteiros)
  const direct = accounts.find((a) => {
    const n = normalize(a.name)
    return n.includes(needle) || needle.includes(n)
  })
  if (direct) return direct.id

  // Caminho 2b: token-level intersection com desempate por count.
  const needleTokens = new Set(tokenize(trimmed))
  if (needleTokens.size === 0) return null

  let best: { id: string; score: number } | null = null
  for (const a of accounts) {
    const aTokens = tokenize(a.name)
    let score = 0
    for (const t of aTokens) if (needleTokens.has(t)) score++
    if (score === 0) continue
    if (!best || score > best.score) best = { id: a.id, score }
  }
  return best?.id ?? null
}
