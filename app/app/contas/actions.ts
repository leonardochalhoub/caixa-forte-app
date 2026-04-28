"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum([
    "checking",
    "credit",
    "cash",
    "wallet",
    "savings",
    "investment",
    "poupanca",
    "crypto",
    "fgts",
    "ticket",
  ]),
  openingBalanceCents: z.number().int().optional(),
  isFormalIncome: z.boolean().optional(),
})

export async function createAccount(input: z.infer<typeof CreateAccountSchema>) {
  const user = await requireUser()
  const parsed = CreateAccountSchema.parse(input)
  const supabase = await createServerClient()
  // Ticket sempre formal (regra de negócio); outros tipos default false
  // a menos que o user marque na UI.
  const formal = parsed.type === "ticket" ? true : (parsed.isFormalIncome ?? false)
  const opening = parsed.openingBalanceCents ?? 0

  // Quando a conta é marcada como rendimento formal E tem saldo inicial,
  // ao invés de gravar opening_balance_cents, criamos uma transação de
  // income (paid_at=hoje). Assim o saldo inicial entra ao mesmo tempo
  // como SALDO TOTAL e como ENTRADA DO MÊS — comportamento que o user
  // pediu: "When a user creates a Conta, it must add to saldo".
  // Para contas não-formais ou sem saldo inicial, mantemos
  // opening_balance_cents (comportamento legado).
  const shouldSeedIncomeTx = formal && opening > 0
  const openingForAccount = shouldSeedIncomeTx ? 0 : opening

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: parsed.name,
      type: parsed.type,
      opening_balance_cents: openingForAccount,
      is_formal_income: formal,
    } as never)
    .select()
    .single()
  if (error) throw new Error(error.message)

  if (shouldSeedIncomeTx && data) {
    // Categoria: pega a primeira categoria is_formal_income=true do user
    // (Salário, Vale-Alimentação, etc — depende do que ele tem).
    // Se não houver, deixa NULL (vai pra "sem categoria" e user atribui depois).
    const { data: formalCat } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_formal_income", true)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle()

    const today = new Date().toISOString().slice(0, 10)
    await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: (data as { id: string }).id,
        category_id: formalCat?.id ?? null,
        type: "income",
        amount_cents: opening,
        occurred_on: today,
        merchant: `Saldo inicial · ${parsed.name}`,
        note: "Lançamento automático ao criar conta com 'rendimento formal' marcado.",
        source: "manual",
        paid_at: `${today}T12:00:00Z`,
      } as never)
  }

  revalidatePath("/app/contas")
  revalidatePath("/app")
  return data
}

const RenameAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
})

export async function renameAccount(input: z.infer<typeof RenameAccountSchema>) {
  const user = await requireUser()
  const parsed = RenameAccountSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("accounts")
    .update({ name: parsed.name })
    .eq("id", parsed.id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/contas")
}

const ClassifyAccountSchema = z.object({
  id: z.string().uuid(),
  classification: z.enum(["circulante", "nao_circulante"]).nullable(),
})

export async function setAccountBalanceClassification(
  input: z.infer<typeof ClassifyAccountSchema>,
) {
  const user = await requireUser()
  const parsed = ClassifyAccountSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (row: object) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => Promise<{ error: { message: string } | null }>
          }
        }
      }
    }
  )
    .from("accounts")
    .update({ balance_classification: parsed.classification })
    .eq("id", parsed.id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/contas")
  revalidatePath("/app/relatorios/balanco")
}

export async function archiveAccount(id: string) {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/contas")
}

// ============================================================
// Balance reconciliation — user declares real balance; if it
// diverges from computed, we create an adjustment transaction
// with a user-provided justification.
// ============================================================

const ReconcileSchema = z.object({
  accountId: z.string().uuid(),
  declaredCents: z.number().int(),
  note: z.string().trim().max(500).nullable(),
})

export async function reconcileAccountBalance(input: z.infer<typeof ReconcileSchema>): Promise<{
  ok: boolean
  diffCents: number
  adjustmentId?: string
}> {
  const user = await requireUser()
  const parsed = ReconcileSchema.parse(input)
  const supabase = await createServerClient()

  const { data: acc, error: accErr } = await supabase
    .from("accounts")
    .select("id, name, opening_balance_cents")
    .eq("id", parsed.accountId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (accErr) throw new Error(accErr.message)
  if (!acc) throw new Error("Conta não encontrada.")

  // Balance shown on the UI only counts rows with paid_at set. Use the
  // same filter here so the diff we compute matches what the user sees —
  // otherwise an unpaid agendada would skew the adjustment.
  const { data: flows, error: flowErr } = await supabase
    .from("transactions")
    .select("type, amount_cents")
    .eq("account_id", parsed.accountId)
    .eq("user_id", user.id)
    .not("paid_at", "is", null)
  if (flowErr) throw new Error(flowErr.message)

  const flow = (flows ?? []).reduce(
    (sum, t) =>
      sum + (t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)),
    0,
  )
  const computed = Number(acc.opening_balance_cents ?? 0) + flow
  const diff = parsed.declaredCents - computed

  if (diff === 0) {
    revalidatePath("/app/contas")
    revalidatePath("/app")
    return { ok: true, diffCents: 0 }
  }

  const adjType = diff > 0 ? "income" : "expense"
  const adjAmount = Math.abs(diff)
  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  // paid_at must be set so the adjustment actually moves the balance.
  // Without it the row is treated as "agendada" and the reconcile is a no-op.
  const { data: adj, error: adjErr } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (row: object) => {
          select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> }
        }
      }
    }
  )
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: parsed.accountId,
      category_id: null,
      type: adjType,
      amount_cents: adjAmount,
      occurred_on: today,
      merchant: "Ajuste de saldo",
      note: parsed.note ?? `Ajuste: declarado vs computado diferiram em ${diff} centavos`,
      source: "manual",
      paid_at: nowIso,
    })
    .select("id")
    .single()
  if (adjErr) throw new Error(adjErr.message)
  if (!adj) throw new Error("Ajuste não retornou linha.")

  revalidatePath("/app/contas")
  revalidatePath("/app")
  return { ok: true, diffCents: diff, adjustmentId: adj.id }
}
