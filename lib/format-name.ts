/**
 * Capitaliza nome: "leonardo chalhoub" → "Leonardo Chalhoub"
 * Mantém palavras conectoras em minúsculo (da, de, do, dos, das, e).
 */
const LOWERCASE_WORDS = new Set(["da", "de", "do", "dos", "das", "e"])

export function formatDisplayName(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      const lower = word.toLowerCase()
      if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(" ")
}

/**
 * True quando o display_name ainda é o fallback do email (prefixo antes do @).
 */
export function isEmailFallbackName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!displayName || !email) return false
  const local = email.split("@")[0]?.toLowerCase() ?? ""
  return displayName.trim().toLowerCase() === local
}

/**
 * Primeiro + último nome (pulando conectores). Ex:
 *   "Leonardo Chalhoub Seródio Costa Faria" → "Leonardo Faria"
 *   "Maria da Silva" → "Maria Silva"
 *   "Leo" → "Leo"
 */
export function formatShortName(raw: string | null | undefined): string {
  if (!raw) return ""
  const formatted = formatDisplayName(raw)
  const parts = formatted.split(/\s+/).filter(Boolean)
  const meaningful = parts.filter((p) => !LOWERCASE_WORDS.has(p.toLowerCase()))
  if (meaningful.length <= 1) return meaningful[0] ?? parts[0] ?? ""
  return `${meaningful[0]} ${meaningful[meaningful.length - 1]}`
}
