#!/usr/bin/env node
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
const USER_ID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"
const rows = await q(
  `select name, is_income, is_formal_income from public.categories where user_id = '${USER_ID}' and is_income = true order by name;`,
)
console.log(JSON.stringify(rows, null, 2))
