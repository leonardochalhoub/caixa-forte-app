import { NextResponse } from "next/server"
import { z } from "zod"
import { getUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const RegistrySchema = z.object({
  period: z.string().min(1),
  kind: z.enum([
    "compra_vista",
    "compra_financiada",
    "aporte",
    "retirada",
    "valorizacao",
    "pagamento_divida",
    "emprestimo",
    "reclassificacao",
  ]),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive(),
  debitSection: z.string().min(1),
  debitLabel: z.string().trim().min(1).max(80),
  creditSection: z.string().min(1),
  creditLabel: z.string().trim().min(1).max(80),
  note: z.string().trim().max(300).nullable().optional(),
})

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
    const parseResult = RegistrySchema.safeParse(body)
    if (!parseResult.success) {
      const first = parseResult.error.issues[0]
      return NextResponse.json(
        {
          ok: false,
          error: `Dados inválidos: ${first?.path.join(".") ?? "?"} — ${first?.message ?? "formato incorreto"}`,
        },
        { status: 400 },
      )
    }
    const parsed = parseResult.data

    const supabase = await createServerClient()

    const { data: reg, error: regErr } = await supabase
      .from("balance_registries")
      .insert({
        user_id: user.id,
        period: parsed.period,
        kind: parsed.kind,
        description: parsed.description,
        amount_cents: parsed.amountCents,
        debit_section: parsed.debitSection,
        debit_label: parsed.debitLabel,
        credit_section: parsed.creditSection,
        credit_label: parsed.creditLabel,
        note: parsed.note ?? null,
      })
      .select("id")
      .single()
    if (regErr) {
      return NextResponse.json(
        { ok: false, error: `DB registry: ${regErr.message}` },
        { status: 500 },
      )
    }
    const registryId = reg.id as string

    const debitSign = parsed.debitSection.startsWith("passivo") ? -1 : 1
    const creditSign = parsed.creditSection.startsWith("passivo") ? 1 : -1

    const pair = [
      {
        user_id: user.id,
        period: parsed.period,
        line_key: `${parsed.debitSection}::registry:${registryId}:debit`,
        label: parsed.debitLabel,
        amount_cents: parsed.amountCents * debitSign,
        note: `${parsed.description}${parsed.note ? " · " + parsed.note : ""}`,
        metadata: { registry_id: registryId, role: "debit", kind: parsed.kind },
      },
      {
        user_id: user.id,
        period: parsed.period,
        line_key: `${parsed.creditSection}::registry:${registryId}:credit`,
        label: parsed.creditLabel,
        amount_cents: parsed.amountCents * creditSign,
        note: `${parsed.description}${parsed.note ? " · " + parsed.note : ""}`,
        metadata: { registry_id: registryId, role: "credit", kind: parsed.kind },
      },
    ]
    const { error: adjErr } = await supabase
      .from("balance_adjustments")
      .insert(pair)
    if (adjErr) {
      return NextResponse.json(
        { ok: false, error: `DB adjustments: ${adjErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, id: registryId })
  } catch (err) {
    console.error("[balance-registry/create] fatal:", err)
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
