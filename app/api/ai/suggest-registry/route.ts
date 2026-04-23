import { NextResponse } from "next/server"
import { getUser } from "@/lib/auth"
import { GROQ_MODELS } from "@/lib/groq/client"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const AI_KINDS = [
  "compra_vista",
  "compra_financiada",
  "aporte",
  "retirada",
  "valorizacao",
  "pagamento_divida",
  "emprestimo",
  "reclassificacao",
] as const

const AI_SECTIONS = [
  "ativo_circulante_disponivel",
  "ativo_circulante_renda_fixa",
  "ativo_circulante_renda_variavel",
  "ativo_circulante_cripto",
  "ativo_circulante_outros",
  "ativo_nc_bloqueado",
  "ativo_nc_imobilizado",
  "ativo_nc_intangivel",
  "passivo_circulante_cartoes",
  "passivo_circulante_outros",
  "passivo_nc_financiamentos",
  "patrimonio_liquido",
] as const

const SYSTEM_PROMPT = `Você é contador formado pela USP especializado em finanças pessoais brasileiras.
Usuário descreve em pt-BR uma operação e você devolve JSON com partida dobrada.

KINDS:
- compra_vista: comprou bem pagando à vista (débito=ativo_nc_imobilizado, crédito=ativo_circulante_disponivel)
- compra_financiada: comprou bem a prazo (débito=ativo_nc_imobilizado, crédito=passivo_nc_financiamentos)
- aporte: dinheiro externo entrou (débito=ativo_circulante_disponivel, crédito=patrimonio_liquido)
- retirada: gasto pessoal que reduz PL (pensão, aluguel, conta luz, mensalidade). Débito=patrimonio_liquido, crédito=ativo_circulante_disponivel
- valorizacao: reavaliação de ativo (débito=ativo_nc_imobilizado, crédito=patrimonio_liquido)
- pagamento_divida: quitou dívida (débito=passivo_*, crédito=ativo_circulante_disponivel)
- emprestimo: tomou empréstimo (débito=ativo_circulante_disponivel, crédito=passivo_nc_financiamentos)
- reclassificacao: move valor entre seções

SEÇÕES VÁLIDAS: ${AI_SECTIONS.join(", ")}

PARSING DE VALOR: "R$ 500" → 50000, "mil reais" → 100000, "500,99" → 50099

Devolva APENAS JSON (sem markdown, sem explicação) com:
{
  "kind": "<um dos KINDS>",
  "description": "frase curta",
  "debit_section": "<uma SEÇÃO>",
  "debit_label": "nome da linha",
  "credit_section": "<uma SEÇÃO>",
  "credit_label": "nome da linha",
  "amount_cents": número ou null,
  "note": "opcional ou null"
}`

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Sessão expirada." },
        { status: 401 },
      )
    }

    const body = await req.json().catch(() => null)
    const description = (body?.description ?? "").toString().trim()
    if (description.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Descrição muito curta." },
        { status: 400 },
      )
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "GROQ_API_KEY ausente no servidor." },
        { status: 503 },
      )
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODELS.parser,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: description },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 512,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return NextResponse.json(
        { ok: false, error: `Groq ${res.status}: ${txt.slice(0, 120)}` },
        { status: 502 },
      )
    }
    const respJson = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = respJson.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { ok: false, error: "IA retornou vazio." },
        { status: 502 },
      )
    }

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { ok: false, error: `Formato inválido: ${content.slice(0, 100)}` },
        { status: 502 },
      )
    }

    const normalizeAmount = (v: unknown): number | null => {
      if (v == null || v === "" || v === "null") return null
      if (typeof v === "number") return Math.round(v)
      if (typeof v === "string") {
        const n = Number(v.replace(/[^\d]/g, ""))
        return Number.isFinite(n) && n > 0 ? n : null
      }
      return null
    }
    const kind = String(parsed.kind ?? "")
    const debitSection = String(parsed.debit_section ?? "")
    const creditSection = String(parsed.credit_section ?? "")
    const validKind = (AI_KINDS as readonly string[]).includes(kind)
      ? kind
      : "retirada"
    const validDebit = (AI_SECTIONS as readonly string[]).includes(debitSection)
      ? debitSection
      : "patrimonio_liquido"
    const validCredit = (AI_SECTIONS as readonly string[]).includes(creditSection)
      ? creditSection
      : "ativo_circulante_disponivel"

    return NextResponse.json({
      ok: true,
      kind: validKind,
      description:
        String(parsed.description ?? "").trim() || "Registro sem descrição",
      debit_section: validDebit,
      debit_label: String(parsed.debit_label ?? "").trim() || "Débito",
      credit_section: validCredit,
      credit_label: String(parsed.credit_label ?? "").trim() || "Crédito",
      amount_cents: normalizeAmount(parsed.amount_cents),
      note:
        parsed.note == null || parsed.note === "null" || parsed.note === ""
          ? null
          : String(parsed.note).trim(),
    })
  } catch (err) {
    console.error("[suggest-registry] fatal:", err)
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
