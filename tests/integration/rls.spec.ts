/**
 * RLS isolation smoke test.
 *
 * Requires Supabase local running (`npx supabase start`) with migrations applied.
 * Skipped when SUPABASE_TEST_URL is not set.
 *
 * AT-004 from DEFINE: User B cannot read User A's transactions.
 */
import { describe, expect, it, beforeAll } from "vitest"
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

const maybeDescribe = url && anonKey && serviceKey ? describe : describe.skip

maybeDescribe("RLS — transactions isolation", () => {
  let userAId: string
  let userBId: string
  let userAToken: string
  let userBToken: string

  beforeAll(async () => {
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const emailA = `a-${Date.now()}@test.local`
    const emailB = `b-${Date.now()}@test.local`
    const password = "test-password-xyz"

    const { data: a } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    })
    const { data: b } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    })
    userAId = a.user!.id
    userBId = b.user!.id

    const anonA = createClient(url!, anonKey!)
    const anonB = createClient(url!, anonKey!)
    const signA = await anonA.auth.signInWithPassword({ email: emailA, password })
    const signB = await anonB.auth.signInWithPassword({ email: emailB, password })
    userAToken = signA.data.session!.access_token
    userBToken = signB.data.session!.access_token

    // Seed 1 account + 1 tx for user A
    const clientA = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${userAToken}` } },
    })
    const { data: accA } = await clientA
      .from("accounts")
      .insert({ user_id: userAId, name: "Test-A", type: "checking" })
      .select()
      .single()
    await clientA.from("transactions").insert({
      user_id: userAId,
      account_id: accA!.id,
      type: "expense",
      amount_cents: 1234,
      occurred_on: "2026-04-22",
      source: "manual",
    })
  })

  it("user B cannot see user A's transactions", async () => {
    const clientB = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${userBToken}` } },
    })
    const { data, error } = await clientB.from("transactions").select("id")
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("user A sees their own transactions", async () => {
    const clientA = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${userAToken}` } },
    })
    const { data, error } = await clientA.from("transactions").select("id, amount_cents")
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThanOrEqual(1)
    expect(data?.[0]?.amount_cents).toBe(1234)
  })

  it("signup creates profile + seeds default categories", async () => {
    const clientA = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${userAToken}` } },
    })
    const { data: profile } = await clientA
      .from("profiles")
      .select("user_id")
      .eq("user_id", userAId)
      .maybeSingle()
    expect(profile?.user_id).toBe(userAId)

    const { data: cats } = await clientA.from("categories").select("id, name, parent_id")
    expect((cats ?? []).length).toBeGreaterThanOrEqual(10)
    const parents = (cats ?? []).filter((c) => !c.parent_id)
    expect(parents.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "Mercado",
        "Transporte",
        "Restaurantes",
        "Contas Fixas",
        "Saúde",
        "Lazer",
        "Educação",
        "Assinaturas",
        "Renda",
        "Outros",
      ]),
    )
  })
})
