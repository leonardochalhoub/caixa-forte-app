import { NextResponse } from "next/server"
import { getUser } from "@/lib/auth"
import { LLM_MODELS, LLM_ENDPOINT, getLLMApiKey } from "@/lib/llm/provider"

export const dynamic = "force-dynamic"
export const maxDuration = 45

const SYSTEM_PROMPT = `Você é um contador formado pela USP com 20 anos de experiência em finanças pessoais brasileiras.
O usuário envia um SNAPSHOT do Balanço Patrimonial pessoal dele (estruturado em JSON) + uma pergunta opcional.
Sua resposta deve ser útil, direta, em português do Brasil, com tom profissional mas acessível.

REGRAS DURAS:
- SEMPRE 2 a 3 parágrafos mínimo, com começo, meio e fim.
  - Começo: resumo da posição patrimonial (1 parágrafo — o "retrato").
  - Meio: análise crítica — pontos fortes, pontos fracos, indicadores de liquidez/endividamento, concentração de risco.
  - Fim: sugestão acionável e priorizada.
- Use valores absolutos em R$ quando citar números específicos (ex: "R$ 46.417,89 em FGTS").
- Se o PL for negativo, dê alerta claro e explique o que significa.
- Se houver concentração excessiva (ex: >80% em 1 conta ou bolso), sinalize como risco.
- Se o índice de liquidez imediata (Disponibilidades / Passivo Circulante) for baixo (<1), sinalize.
- Nunca invente números que não estão no snapshot.
- Nunca use markdown pesado (sem ##, sem listas com bullets estilosos) — texto corrido, profissional.
- Se o usuário fez uma pergunta específica, responda ela DEPOIS do resumo-análise-sugestão.

NÃO comente:
- Rentabilidade de investimentos específicos
- Projeções futuras
- Imposto de renda a menos que esteja no snapshot
- Comparação com outros usuários`

type RequestBody = {
  snapshot: Record<string, unknown>
  question?: string
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Sessão expirada." },
        { status: 401 },
      )
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null
    if (!body || typeof body !== "object" || !body.snapshot) {
      return NextResponse.json(
        { ok: false, error: "Snapshot do balanço ausente." },
        { status: 400 },
      )
    }

    const apiKey = getLLMApiKey()
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "LLM API key ausente no servidor." },
        { status: 503 },
      )
    }

    const userMessage = [
      "SNAPSHOT DO BALANÇO:",
      JSON.stringify(body.snapshot, null, 2),
      "",
      body.question?.trim()
        ? `PERGUNTA DO USUÁRIO: ${body.question.trim()}`
        : "PERGUNTA DO USUÁRIO: (nenhuma — faça uma análise geral)",
    ].join("\n")

    const callLLM = (model: string) =>
      fetch(LLM_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          temperature: 0.4,
          max_tokens: 1024,
        }),
      })

    let res = await callLLM(LLM_MODELS.parser)
    if (res.status === 429) {
      res = await callLLM(LLM_MODELS.parserFallback)
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      const hint =
        res.status === 429
          ? "Rate limit do LLM esgotado. Tente de novo em alguns minutos."
          : `LLM ${res.status}: ${txt.slice(0, 120)}`
      return NextResponse.json({ ok: false, error: hint }, { status: 502 })
    }

    const respJson = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const analysis = respJson.choices?.[0]?.message?.content?.trim()
    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: "IA retornou vazio." },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, analysis })
  } catch (err) {
    console.error("[balanco-analysis] fatal:", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : "Erro interno inesperado.",
      },
      { status: 500 },
    )
  }
}
