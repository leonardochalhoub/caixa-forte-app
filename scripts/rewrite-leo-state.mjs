#!/usr/bin/env node
// One-shot: limpa transações/capturas do user Leo e registra o estado
// correto baseado no que ele me contou na conversa.

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  return r.json()
}

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"
const MP = "265c07ac-6b7b-456e-a4f4-b1ff46269bc3"
const NUBANK = "d85521c7-e0bc-4bdd-b946-ab94e8cd3458"
const CAIXA = "40701570-23cf-403d-b4bb-b9363b158df1"

// 1. Clean slate
await q(`delete from public.capture_messages where user_id = '${UID}';`)
const del = await q(`delete from public.transactions where user_id = '${UID}' returning id;`)
console.log(`deleted ${Array.isArray(del) ? del.length : 0} transactions + all captures`)

// 2. Set opening balances
//    MP = current (10725.88) — renda fixa, não teve flow em abril
//    Nubank = pre-April (7504.20) — recebeu 4246.22 de transferência em abril => 11750.42
//    Caixa = 0 — recebeu salário, pagou Estácio+fatura, transferiu sobra
await q(`
  update public.accounts set opening_balance_cents = 1072588
  where id = '${MP}' and user_id = '${UID}';
`)
await q(`
  update public.accounts set opening_balance_cents = 750420
  where id = '${NUBANK}' and user_id = '${UID}';
`)
await q(`
  update public.accounts set opening_balance_cents = 0
  where id = '${CAIXA}' and user_id = '${UID}';
`)
console.log("opening balances set: MP 10725.88 · Nubank 7504.20 · Caixa 0")

// 3. Lookup category IDs
const cats = await q(`
  select c.id, c.name, p.name as parent_name
  from public.categories c
  left join public.categories p on p.id = c.parent_id
  where c.user_id = '${UID}'
    and c.archived_at is null
    and lower(c.name) in ('salário', 'mensalidade', 'contas fixas', 'outros');
`)
const find = (n, parent) =>
  cats.find((c) => c.name.toLowerCase() === n.toLowerCase() && (parent ? c.parent_name?.toLowerCase() === parent.toLowerCase() : true))?.id

const SALARIO = find("Salário", "Renda")
const MENSALIDADE = find("Mensalidade", "Educação")
const CONTAS_FIXAS = find("Contas Fixas")
const OUTROS = find("Outros")

console.log("categories:", { SALARIO, MENSALIDADE, CONTAS_FIXAS, OUTROS })

// 4. Insert April transactions
const rows = [
  // Apr 10: Estácio mensalidade (real expense)
  [CAIXA, MENSALIDADE, "expense", 22266, "2026-04-10", "Estácio", "Mensalidade — Engenharia de Software", false],
  // Apr 15: salary (formal income)
  [CAIXA, SALARIO, "income", 654796, "2026-04-15", "TED Salário", null, false],
  // Apr 21: Caixa credit card bill (real expense)
  [CAIXA, CONTAS_FIXAS, "expense", 207908, "2026-04-21", "Caixa Cartão", "Fatura paga", false],
  // Apr 21: transfer Caixa → Nubank residual (excluded from KPIs)
  [CAIXA, OUTROS, "expense", 424622, "2026-04-21", "→ Nubank", "Transferência interna — sobra do mês pra renda fixa", true],
  [NUBANK, OUTROS, "income", 424622, "2026-04-21", "← Caixa", "Transferência interna recebida", true],
  // Apr 27: Nubank credit card bill (FUTURE — not yet paid)
  [NUBANK, CONTAS_FIXAS, "expense", 641525, "2026-04-27", "Nubank Cartão", "Fatura a vencer", false],
]

const values = rows
  .map(
    ([account, cat, type, amt, date, merchant, note, isTransfer]) =>
      `('${UID}', '${account}', ${cat ? `'${cat}'` : "null"}, '${type}', ${amt}, '${date}', '${merchant}', ${note ? `'${note}'` : "null"}, 'manual', ${isTransfer})`,
  )
  .join(", ")

const ins = await q(`
  insert into public.transactions (user_id, account_id, category_id, type, amount_cents, occurred_on, merchant, note, source, is_transfer)
  values ${values}
  returning merchant, occurred_on, amount_cents, type, is_transfer;
`)
console.log("inserted:", JSON.stringify(ins, null, 2))

// 5. Verify totals
const summary = await q(`
  select
    (select coalesce(sum(opening_balance_cents),0)::int from public.accounts where user_id = '${UID}' and archived_at is null) as opening_total,
    (select coalesce(sum(case when type = 'income' then amount_cents else -amount_cents end),0)::int
       from public.transactions
       where user_id = '${UID}' and occurred_on <= current_date) as realized_flow,
    (select coalesce(sum(amount_cents),0)::int
       from public.transactions t
       join public.categories c on c.id = t.category_id
       where t.user_id = '${UID}' and t.type = 'income'
         and t.is_transfer = false
         and c.is_formal_income = true
         and t.occurred_on >= date_trunc('month', current_date)
         and t.occurred_on <= current_date) as mes_entrada_formal,
    (select coalesce(sum(amount_cents),0)::int
       from public.transactions
       where user_id = '${UID}' and type = 'expense'
         and is_transfer = false
         and occurred_on >= date_trunc('month', current_date)) as mes_saida;
`)
console.log("\n=== summary ===")
console.log(JSON.stringify(summary, null, 2))
const s = summary[0]
console.log(`\nSaldo total agora: R$ ${((Number(s.opening_total) + Number(s.realized_flow)) / 100).toFixed(2)}`)
console.log(`Entrada do mês (formal): R$ ${(Number(s.mes_entrada_formal) / 100).toFixed(2)}`)
console.log(`Saída do mês: R$ ${(Number(s.mes_saida) / 100).toFixed(2)}`)
