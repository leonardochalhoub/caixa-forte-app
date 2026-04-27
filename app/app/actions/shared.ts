import { z } from "zod"
import type { createServerClient } from "@/lib/supabase/server"

// ============================================================
// Schemas compartilhados entre transactions e captures.
// ============================================================

export const CreateTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida"),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  merchant: z.string().max(200).nullable(),
  note: z.string().max(1000).nullable(),
  // When true, the money is considered already settled and hits the
  // account balance immediately. When false, the row is "scheduled" —
  // stays off balance until the user later marks it as paid.
  paid: z.boolean().optional(),
})

export const UpdateTransactionSchema = CreateTransactionSchema.extend({
  id: z.string().uuid(),
})

export const ResolvePendingSchema = z.object({
  captureId: z.string().uuid(),
  accountId: z.string().uuid(),
  paid: z.boolean().optional(),
})

export const TextCaptureInput = z.object({ rawInput: z.string().trim().min(1).max(2000) })

// ============================================================
// CaptureResult — shape público devolvido pelas actions de captura.
// ============================================================

export interface CaptureResult {
  ok: boolean
  transactionId?: string
  captureId: string
  error?: string
  parsed?: {
    amountCents: number
    type: "income" | "expense"
    categoryName: string
    subcategoryName: string | null
    merchant: string | null
    occurredOn: string
    confidence: number
  }
  transcription?: string
  fallbackFormNeeded?: boolean
}

// ============================================================
// Helpers de paid_at e fatura de cartão.
// ============================================================

// Computes the paid_at value from the form inputs:
//   • explicit paid=true ................ paid right now
//   • explicit paid=false ............... scheduled (null)
//   • paid omitted, occurredOn <= today . paid at noon of occurredOn (auto)
//   • paid omitted, occurredOn > today .. scheduled (null)
export function resolvePaidAt(
  occurredOn: string,
  paid: boolean | undefined,
  todayIso: string,
): string | null {
  if (paid === true) return new Date().toISOString()
  if (paid === false) return null
  if (occurredOn <= todayIso) return `${occurredOn}T12:00:00Z`
  return null
}

// Meses em português (lowercase) pra detectar merchant como
// "Nubank Cartão Abril 2026" — precisamos saber a qual mês o
// lump-sum se refere pra decidir fatura aberta/fechada.
export const MONTH_NAMES_PT_LOWER = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

export function normalizePt(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function bankKeyFromCardName(cardName: string): string {
  const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
  return normalizePt(cleaned.split(/\s+/)[0] ?? "")
}

export function addMonths(ym: string, n: number): string {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

// Decide a qual fatura o charge deve pertencer: começa pelo mês
// desejado e avança enquanto a fatura daquele mês estiver paga
// (detectada por um lump-sum "<banco> cartão <mes> <ano>" com
// paid_at setado em qualquer conta). Retorna a primeira data do
// mês escolhido, ou o próprio seedDate se o mês dele já está aberto.
export async function nextOpenInvoiceDate(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  cardName: string,
  seedDate: string,
): Promise<string> {
  const bankKey = bankKeyFromCardName(cardName)
  if (!bankKey) return seedDate

  // Limita a janela: o detector de "fatura fechada" via merchant
  // string só faz sentido pros últimos meses. Sem .gte e .limit, esse
  // SELECT virava full-table-scan da ledger inteira por charge.
  const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 86400_000)
    .toISOString()
    .slice(0, 10)
  const { data: lumpSumsRaw } = await supabase
    .from("transactions")
    .select("merchant, paid_at, is_transfer, type")
    .eq("user_id", userId)
    .not("paid_at", "is", null)
    .gte("occurred_on", twoYearsAgo)
    .limit(500)
  const lumpSums = (lumpSumsRaw ?? []) as Array<{
    merchant: string | null
    paid_at: string | null
    is_transfer: boolean | null
    type: string
  }>

  const closedMonths = new Set<string>()
  for (const t of lumpSums) {
    if (t.is_transfer) continue
    if (t.type !== "expense") continue
    const m = normalizePt(t.merchant ?? "")
    if (!m.includes("cartao")) continue
    if (!m.includes(bankKey)) continue
    for (let i = 0; i < 12; i++) {
      if (!m.includes(MONTH_NAMES_PT_LOWER[i]!)) continue
      const yMatch = m.match(/(20\d{2})/)
      if (!yMatch) continue
      const year = yMatch[1]
      closedMonths.add(`${year}-${String(i + 1).padStart(2, "0")}`)
      break
    }
  }

  let ym = seedDate.slice(0, 7)
  let safety = 24
  while (closedMonths.has(ym) && safety > 0) {
    ym = addMonths(ym, 1)
    safety--
  }

  if (ym === seedDate.slice(0, 7)) return seedDate
  return `${ym}-01`
}
