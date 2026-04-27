import { z } from "zod"

// Janela aceita pra occurred_on: até 5 anos no passado, até 30 dias
// no futuro. Bloqueia hallucinations típicas do Groq (data > hoje
// quando o user não disse explicitamente que era agendamento).
const MAX_PAST_YEARS = 5
const MAX_FUTURE_DAYS = 30

export const ParseResultSchema = z.object({
  amount_cents: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  category_name: z.string().trim().min(1),
  subcategory_name: z.string().trim().min(1).nullable(),
  merchant: z.string().trim().min(1).max(120).nullable(),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (d) => {
        const today = new Date()
        const minDate = new Date(
          today.getTime() - MAX_PAST_YEARS * 365 * 86400_000,
        )
          .toISOString()
          .slice(0, 10)
        const maxDate = new Date(today.getTime() + MAX_FUTURE_DAYS * 86400_000)
          .toISOString()
          .slice(0, 10)
        return d >= minDate && d <= maxDate
      },
      {
        message: `occurred_on fora da janela aceita (passado <${MAX_PAST_YEARS}y, futuro <${MAX_FUTURE_DAYS}d)`,
      },
    ),
  note: z.string().trim().max(500).nullable(),
  confidence: z.number().min(0).max(1),
  account_hint: z.string().trim().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ParseResult = z.infer<typeof ParseResultSchema>
