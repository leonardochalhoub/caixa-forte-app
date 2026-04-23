import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUser, isAdminish } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const DEMO_EMAIL = "larissa.demo@caixa-forte.app"
const DEMO_PASSWORD = "DemoPublico#2026"
const DEMO_NAME = "Larissa Oliveira"

type SeedLog = { step: string; detail: string; ok: boolean }

type RangeKey = "full" | "2025" | "2026" | "q1-2026" | "last-12m"

function chunksForRange(range: RangeKey): [string, string][] {
  const pair = (a: string, b: string): [string, string] => [a, b]
  switch (range) {
    case "2025":
      return [
        pair("2025-01", "2025-02"),
        pair("2025-03", "2025-04"),
        pair("2025-05", "2025-06"),
        pair("2025-07", "2025-08"),
        pair("2025-09", "2025-10"),
        pair("2025-11", "2025-12"),
      ]
    case "2026":
      return [pair("2026-01", "2026-02"), pair("2026-03", "2026-04")]
    case "q1-2026":
      return [pair("2026-01", "2026-02"), pair("2026-03", "2026-03")]
    case "last-12m": {
      const now = new Date()
      const months: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        )
      }
      const out: [string, string][] = []
      for (let i = 0; i < months.length; i += 2) {
        out.push(pair(months[i]!, months[i + 1] ?? months[i]!))
      }
      return out
    }
    case "full":
    default:
      return [
        pair("2025-01", "2025-02"),
        pair("2025-03", "2025-04"),
        pair("2025-05", "2025-06"),
        pair("2025-07", "2025-08"),
        pair("2025-09", "2025-10"),
        pair("2025-11", "2025-12"),
        pair("2026-01", "2026-02"),
        pair("2026-03", "2026-04"),
      ]
  }
}

export async function POST(req: Request) {
  const logs: SeedLog[] = []
  const note = (step: string, detail: string, ok = true) =>
    logs.push({ step, detail, ok })

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      )
    }
    const isAdmin = await isAdminish()
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Apenas admin/owner pode re-semear." },
        { status: 403 },
      )
    }
    const body = (await req.json().catch(() => ({}))) as { range?: RangeKey }
    const range: RangeKey = body.range ?? "full"

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const groqKey = process.env.GROQ_API_KEY
    if (!url || !svcKey || !groqKey) {
      return NextResponse.json(
        { ok: false, error: "Variáveis de ambiente ausentes." },
        { status: 503 },
      )
    }

    const sb = createClient(url, svcKey, { auth: { persistSession: false } })

    // --- AUTH USER ---
    let userId: string
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = list?.users?.find((u) => u.email === DEMO_EMAIL)
    if (existing) {
      userId = existing.id
      await sb.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD })
      note("auth", `atualizou senha de ${userId}`)
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: DEMO_NAME, full_name: DEMO_NAME },
      })
      if (error || !data?.user) throw new Error(`createUser: ${error?.message}`)
      userId = data.user.id
      note("auth", `criado ${userId}`)
    }

    // --- PROFILE ---
    const { error: profErr } = await sb.from("profiles").upsert(
      {
        user_id: userId,
        display_name: DEMO_NAME,
        is_demo: true,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    if (profErr) throw new Error(`profile: ${profErr.message}`)
    note("profile", "is_demo=true")

    // --- WIPE ---
    await sb.from("transactions").delete().eq("user_id", userId)
    await sb.from("balance_adjustments").delete().eq("user_id", userId)
    await sb.from("balance_registries").delete().eq("user_id", userId)
    await sb.from("categories").delete().eq("user_id", userId)
    await sb.from("accounts").delete().eq("user_id", userId)
    note("wipe", "dados antigos removidos")

    // --- GROQ ---
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    // Groq free tier: 6000 TPM no 8b, ~30k TPM no 70b. Cada chunk
    // consome ~4k tokens entrada + ~4k saída. Pausa entre calls
    // pra não estourar. Retry com backoff em 429.
    async function callGroq(
      system: string,
      userMsg: string,
      model = "llama-3.3-70b-versatile",
      retries = 0,
    ): Promise<Record<string, unknown>> {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 3000,
        }),
      })
      if (res.status === 429) {
        // Primeiro 429 no 70b → tenta 8b uma vez
        if (model === "llama-3.3-70b-versatile" && retries === 0) {
          note("groq-429", "70b rate-limited → tentando 8b")
          await sleep(3000)
          return callGroq(system, userMsg, "llama-3.1-8b-instant", 0)
        }
        // Retry com backoff (parse Retry-After se houver)
        if (retries < 3) {
          const retryAfter = res.headers.get("retry-after")
          const waitSec = retryAfter ? Number(retryAfter) : 20 * (retries + 1)
          const waitMs = Math.min(60000, Math.max(15000, waitSec * 1000))
          note("groq-429", `aguardando ${Math.round(waitMs / 1000)}s e retry ${retries + 1}/3`)
          await sleep(waitMs)
          return callGroq(system, userMsg, model, retries + 1)
        }
        throw new Error(
          `Groq 429 persistente após 3 retries. Aguarde 1-2 min e tente de novo (ou use range menor).`,
        )
      }
      if (!res.ok) {
        throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      const j = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return JSON.parse(j.choices?.[0]?.message?.content ?? "{}")
    }

    // --- ACCOUNTS ---
    const accSys = `Gerador de contas bancárias pessoais brasileiras. Retorne JSON { "accounts": [...] }.
Cada: { name, type, opening_balance_cents, sort_order, balance_classification }.
Tipos: checking, savings, investment, crypto, fgts, credit.
balance_classification: circulante (checking/savings/invest/crypto), nao_circulante (fgts), null (credit).
Cartão tem opening_balance_cents=0 sempre.`
    const accUser = `6 contas pra Larissa Oliveira, 28 anos, analista de marketing SP, renda ~R$ 8.500/mês, criadas em 01/2025:
Nubank Conta (~R$1.200), Nubank Renda Fixa (~R$6.000), Nubank Cripto (~R$1.500), Caixa Poupança (~R$2.500), Caixa FGTS (~R$42.000), Nubank Cartão (0).`
    const rawAccs = ((await callGroq(accSys, accUser)).accounts as unknown[]) ?? []
    const accountsPayload = rawAccs.map((raw, i) => {
      const a = raw as Record<string, unknown>
      return {
        user_id: userId,
        name: String(a.name ?? `Conta ${i}`),
        type: String(a.type ?? "checking"),
        opening_balance_cents: Math.round(Number(a.opening_balance_cents ?? 0)),
        sort_order: Number(a.sort_order ?? i),
        balance_classification: (a.balance_classification as string | null) ?? null,
      }
    })
    const { data: accs, error: accErr } = await sb
      .from("accounts")
      .insert(accountsPayload)
      .select("id, name, type")
    if (accErr) throw new Error(`accounts: ${accErr.message}`)
    note("accounts", `${accs?.length ?? 0} inseridas`)

    // --- CATEGORIES ---
    const catSys = `Gerador de categorias. JSON { "categories": [...] }. Cada: { name, emoji, kind, sort_order }. kind: expense | income.`
    const catUser = `11 categorias: 8 expense (Moradia, Alimentação, Transporte, Saúde, Lazer, Mercado, Assinaturas, Cuidados Pessoais) + 3 income (Salário, Freelance, Rendimentos).`
    const rawCats = ((await callGroq(catSys, catUser)).categories as unknown[]) ?? []
    const catsPayload = rawCats.map((raw, i) => {
      const c = raw as Record<string, unknown>
      return {
        user_id: userId,
        name: String(c.name ?? `Cat ${i}`),
        emoji: String(c.emoji ?? "💰"),
        kind: (c.kind as string) === "income" ? "income" : "expense",
        sort_order: Number(c.sort_order ?? i),
      }
    })
    const { data: cats, error: catErr } = await sb
      .from("categories")
      .insert(catsPayload)
      .select("id, name, kind")
    if (catErr) throw new Error(`categories: ${catErr.message}`)
    note("categories", `${cats?.length ?? 0} inseridas`)

    // --- TRANSACTIONS (chunks de 2 meses) ---
    const accountList = (accs ?? [])
      .map((a) => `- ${a.name} (${a.type}, id: ${a.id})`)
      .join("\n")
    const catList = (cats ?? [])
      .map((c) => `- ${c.name} (${c.kind}, id: ${c.id})`)
      .join("\n")
    const chunks = chunksForRange(range)
    note("range", `${range} → ${chunks.length} chunks`)
    const txSys = `Gerador de transações realistas de finanças pessoais brasileiras.
JSON { "transactions": [...] }. Cada tx:
{ account_id, category_id (pode ser null), type, amount_cents, occurred_on, paid_at, merchant, is_transfer: false }
amount_cents: centavos inteiro positivo. occurred_on: YYYY-MM-DD. paid_at: ISO timestamp ou null.
Merchant realista pt-BR. Use APENAS os UUIDs reais fornecidos.`

    const accIds = new Set((accs ?? []).map((a) => a.id))
    const catIds = new Set((cats ?? []).map((c) => c.id))
    const allTxs: Record<string, unknown>[] = []
    for (let i = 0; i < chunks.length; i++) {
      const [s, e] = chunks[i]!
      const txUser = `Larissa Oliveira, analista marketing SP. 18-22 tx de ${s} a ${e}.
Por mês: 1 salário (~R$ 7.500-9.000, dia 5, Nubank Conta), aluguel ~R$2.200 dia 10, 3-4 mercados (R$80-300), 3-5 Uber/99 (R$15-60), 2-3 iFood (R$30-120), Netflix R$55, Spotify R$22, academia R$130, 1 compra cartão (Amazon/Shopee/Zara direto no Nubank Cartão), ocasional freelance/saúde/lazer.
Mês passado: 95% paid. Mês corrente (Abr/2026): 70% pagas, 30% agendadas futuras.
Incluir 1 lump-sum MENSAL "Nubank Cartão" no Nubank Conta, unpaid, occurred_on dia 25 do mês, valor R$ 600-1400.
CONTAS:
${accountList}
CATEGORIAS:
${catList}`
      const batch = ((await callGroq(txSys, txUser)).transactions as unknown[]) ?? []
      allTxs.push(...(batch as Record<string, unknown>[]))
      note("groq", `chunk ${s}..${e}: ${batch.length} tx`)
      // Pacing: 10s entre chunks pra não estourar TPM do Groq.
      if (i < chunks.length - 1) await sleep(10000)
    }
    const txPayload = allTxs
      .filter((t) => {
        const aid = t.account_id as string
        return aid && accIds.has(aid) && typeof t.amount_cents === "number" && t.occurred_on
      })
      .map((t) => {
        const cid = t.category_id as string | null
        return {
          user_id: userId,
          account_id: t.account_id as string,
          category_id: cid && catIds.has(cid) ? cid : null,
          type: t.type === "income" ? "income" : "expense",
          amount_cents: Math.abs(Math.round(Number(t.amount_cents))),
          occurred_on: t.occurred_on as string,
          paid_at: (t.paid_at as string | null) ?? null,
          merchant: (t.merchant as string | null) ?? null,
          is_transfer: false,
          source: "web",
        }
      })
    let txInserted = 0
    for (let i = 0; i < txPayload.length; i += 50) {
      const batch = txPayload.slice(i, i + 50)
      const { error } = await sb.from("transactions").insert(batch)
      if (error) {
        note("tx-batch", `${i}: ${error.message}`, false)
        continue
      }
      txInserted += batch.length
    }
    note("transactions", `${txInserted}/${txPayload.length} inseridas`)

    // --- BALANCE ADJUSTMENTS (carro + financiamento) ---
    const adjs = [
      {
        user_id: userId,
        period: "mensal:2026-04",
        line_key: "ativo_nc_imobilizado::custom:honda-fit-2020",
        label: "Honda Fit 2020 (FIPE)",
        amount_cents: 5500000,
        note: "Valor FIPE · código 026052-6",
        metadata: {
          source: "fipe",
          fipe_code: "026052-6",
          brand_id: 25,
          model_id: 5945,
          year_id: "2020-1",
          last_reference_month: "abril/2026",
        },
      },
      {
        user_id: userId,
        period: "mensal:2026-04",
        line_key: "passivo_nc_financiamentos::custom:honda-fit-financiamento",
        label: "Financiamento Honda Fit (Santander · 28/48)",
        amount_cents: 2275000,
        note: "Parcela R$ 950/mês · 20 restantes",
        metadata: null,
      },
    ]
    const { error: adjErr } = await sb.from("balance_adjustments").insert(adjs)
    if (adjErr) note("adjustments", adjErr.message, false)
    else note("adjustments", `${adjs.length} inseridas`)

    // --- BALANCE REGISTRIES (partida dobrada exemplos) ---
    const registriesSpec = [
      {
        period: "mensal:2026-04",
        kind: "retirada",
        description: "Mensalidade Academia",
        amount_cents: 13000,
        debit_section: "patrimonio_liquido",
        debit_label: "Academia",
        credit_section: "ativo_circulante_disponivel",
        credit_label: "Nubank Conta",
        note: "Smart Fit · débito automático",
      },
      {
        period: "mensal:2026-03",
        kind: "pagamento_divida",
        description: "Parcela 27 do Honda Fit",
        amount_cents: 95000,
        debit_section: "passivo_nc_financiamentos",
        debit_label: "Santander Financiamento",
        credit_section: "ativo_circulante_disponivel",
        credit_label: "Nubank Conta",
        note: "Parcela mensal",
      },
    ]
    for (const r of registriesSpec) {
      const { data: reg } = await sb
        .from("balance_registries")
        .insert({ user_id: userId, ...r })
        .select("id")
        .single()
      if (!reg) continue
      const debitSign = r.debit_section.startsWith("passivo") ? -1 : 1
      const creditSign = r.credit_section.startsWith("passivo") ? 1 : -1
      await sb.from("balance_adjustments").insert([
        {
          user_id: userId,
          period: r.period,
          line_key: `${r.debit_section}::registry:${reg.id}:debit`,
          label: r.debit_label,
          amount_cents: r.amount_cents * debitSign,
          note: r.description,
          metadata: { registry_id: reg.id, role: "debit", kind: r.kind },
        },
        {
          user_id: userId,
          period: r.period,
          line_key: `${r.credit_section}::registry:${reg.id}:credit`,
          label: r.credit_label,
          amount_cents: r.amount_cents * creditSign,
          note: r.description,
          metadata: { registry_id: reg.id, role: "credit", kind: r.kind },
        },
      ])
    }
    note("registries", "2 pares partida-dobrada")

    return NextResponse.json({ ok: true, userId, logs })
  } catch (err) {
    note(
      "fatal",
      err instanceof Error ? err.message : String(err),
      false,
    )
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error && err.message ? err.message : "Erro inesperado.",
        logs,
      },
      { status: 500 },
    )
  }
}
