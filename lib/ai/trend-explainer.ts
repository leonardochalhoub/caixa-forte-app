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
    return {
      current: parsed.current ?? "",
      last6: parsed.last6 ?? "",
      last12: parsed.last12 ?? "",
    }
  } catch {
    return FALLBACK
  }
}
