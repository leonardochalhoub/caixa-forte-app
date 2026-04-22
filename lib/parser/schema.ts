import { z } from "zod"

export const ParseResultSchema = z.object({
  amount_cents: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  category_name: z.string().trim().min(1),
  subcategory_name: z.string().trim().min(1).nullable(),
  merchant: z.string().trim().min(1).max(120).nullable(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).nullable(),
  confidence: z.number().min(0).max(1),
  account_hint: z.string().trim().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ParseResult = z.infer<typeof ParseResultSchema>
