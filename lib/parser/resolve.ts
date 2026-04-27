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

// Levenshtein distance — usado pra fuzzy match singular/plural e typos
// próximos. Implementação iterativa O(m*n), suficiente pros tamanhos
// curtos de nomes de categoria.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

// Match com tolerância de 1-2 edits pra cobrir singular/plural e typos
// pequenos sem ser permissivo demais. "Restaurante" vs "Restaurantes" = 1.
// Conselho v4 (genai-architect): "resolveCategoryId sem fuzzy match —
// LLM retorna 'Restaurante' e user tem 'Restaurantes' → cria duplicata."
function fuzzyEqual(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  if (na.length < 4 || nb.length < 4) return false
  const maxLen = Math.max(na.length, nb.length)
  // Tolerância proporcional: 1 edit pra ≤6 chars, 2 pra ≤12, 3 pra >12.
  const tolerance = maxLen <= 6 ? 1 : maxLen <= 12 ? 2 : 3
  return levenshtein(na, nb) <= tolerance
}

export function resolveCategoryId(
  parsed: Pick<ParseResult, "category_name" | "subcategory_name" | "type">,
  categories: CategoryRow[],
): string | null {
  const parents = categories.filter((c) => c.parent_id === null)

  // Caminho 1: match exato (rápido, prioritário).
  let parentMatch = parents.find(
    (p) => normalize(p.name) === normalize(parsed.category_name),
  )

  // Caminho 2: fuzzy (Levenshtein ≤ tolerância). "Restaurante" → "Restaurantes".
  if (!parentMatch) {
    parentMatch = parents.find((p) => fuzzyEqual(p.name, parsed.category_name))
  }

  if (!parentMatch) {
    // Fallback: match em qualquer categoria (parent ou child) com fuzzy.
    const exact = categories.find((c) => normalize(c.name) === normalize(parsed.category_name))
    if (exact) return exact.id
    const fuzzy = categories.find((c) => fuzzyEqual(c.name, parsed.category_name))
    return fuzzy?.id ?? null
  }

  if (!parsed.subcategory_name) return parentMatch.id

  const children = categories.filter((c) => c.parent_id === parentMatch!.id)
  const exactChild = children.find(
    (c) => normalize(c.name) === normalize(parsed.subcategory_name!),
  )
  if (exactChild) return exactChild.id
  const fuzzyChild = children.find((c) => fuzzyEqual(c.name, parsed.subcategory_name!))
  return fuzzyChild?.id ?? parentMatch.id
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
