import { getGroqClient, GROQ_MODELS } from "@/lib/groq/client"

export interface TrendPeriodInput {
  label: string // e.g. "mês atual"
  direction: "rising" | "falling" | "flat"
  netCents: number
  monthly: Array<{ month: string; netCents: number }>
}

export interface TrendExplanations {
  current: string
  last6: string
  last12: string
}

const FALLBACK: TrendExplanations = {
  current: "",
  last6: "",
  last12: "",
}

// In-memory TTL cache. Survives warm lambdas on Vercel for ~5–10 min,
// which is enough to absorb a burst of dashboard refreshes without firing
// a fresh Groq call each time. Key derived from the numeric input so any
// change in the underlying flow forces a fresh call.
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const cache = new Map<string, { at: number; value: TrendExplanations }>()

function cacheKey(
  current: TrendPeriodInput,
  last6: TrendPeriodInput,
  last12: TrendPeriodInput,
): string {
  const mini = (p: TrendPeriodInput) =>
    `${p.label}|${p.direction}|${Math.round(p.netCents / 100)}|` +
    p.monthly.map((m) => `${m.month}:${Math.round(m.netCents / 100)}`).join(",")
  return [mini(current), mini(last6), mini(last12)].join("||")
}

function getCached(key: string): TrendExplanations | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function setCached(key: string, value: TrendExplanations) {
  cache.set(key, { at: Date.now(), value })
  // Opportunistic cleanup — keeps the map from growing unbounded on
  // long-lived lambdas.
  if (cache.size > 256) {
    const cutoff = Date.now() - CACHE_TTL_MS
    for (const [k, v] of cache) {
      if (v.at < cutoff) cache.delete(k)
    }
  }
}

/**
 * Generates three short pt-BR explanations of the aggregate-trend verdicts
 * (mês atual, 6m, 12m) via Groq so the sysadmin sees *why* the number went
 * where it did — not just "Empobrecendo". Returns empty strings when Groq
 * isn't configured or the call fails, so the UI can degrade gracefully.
 *
 * Single JSON-mode completion for all three periods to keep the hot path
 * cheap (one round-trip per admin page render).
 */
export async function explainTrends(
  current: TrendPeriodInput,
  last6: TrendPeriodInput,
  last12: TrendPeriodInput,
): Promise<TrendExplanations> {
  const key = cacheKey(current, last6, last12)
  const cached = getCached(key)
  if (cached) return cached

  const groq = getGroqClient()
  if (!groq) return FALLBACK

  const toPayload = (p: TrendPeriodInput) => ({
    periodo: p.label,
    veredito: p.direction,
    net_total_reais: Math.round(p.netCents / 100),
    meses: p.monthly.map((m) => ({
      mes: m.month,
      net_reais: Math.round(m.netCents / 100),
    })),
  })

  const prompt = `Você é um analista financeiro do app Caixa Forte.
Para cada um dos três períodos abaixo, escreva UMA frase curta em português
explicando o que os números estão dizendo em termos práticos — foco em causa
e impacto no bolso. NÃO repita o veredito (Enriquecendo/Empobrecendo)
literalmente. NÃO use jargão técnico. Máx. 22 palavras por frase.

Dados de fluxo financeiro (net = entradas − saídas, sem transferências):
${JSON.stringify(
  {
    mes_atual: toPayload(current),
    ultimos_6_meses: toPayload(last6),
    ultimos_12_meses: toPayload(last12),
  },
  null,
  2,
)}

Responda APENAS com JSON no formato exato:
{"current":"<frase>","last6":"<frase>","last12":"<frase>"}`

  try {
    const resp = await groq.chat.completions.create({
      model: GROQ_MODELS.chat,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output only valid JSON. Portuguese only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 300,
    })
    const raw = resp.choices[0]?.message?.content ?? ""
    const parsed = JSON.parse(raw) as Partial<TrendExplanations>
    const value: TrendExplanations = {
      current: parsed.current ?? "",
      last6: parsed.last6 ?? "",
      last12: parsed.last12 ?? "",
    }
    // Only cache non-empty responses so a transient failure doesn't pin
    // blank sentences for 30 minutes.
    if (value.current || value.last6 || value.last12) setCached(key, value)
    return value
  } catch {
    return FALLBACK
  }
}
