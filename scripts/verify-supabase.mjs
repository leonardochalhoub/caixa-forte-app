#!/usr/bin/env node
import { inspect } from "node:util"

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!PAT || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF")
  process.exit(2)
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

console.log("=== 1. Tables in public ===")
const tables = await q(`
  select tablename from pg_tables
  where schemaname = 'public'
  order by tablename;
`)
console.log(tables.map((r) => r.tablename).join(", "))

console.log("\n=== 2. RLS enabled ===")
const rls = await q(`
  select tablename, rowsecurity from pg_tables
  where schemaname = 'public'
  order by tablename;
`)
console.table(rls)

console.log("\n=== 3. Policies per table ===")
const policies = await q(`
  select tablename, count(*)::int as policies
  from pg_policies
  where schemaname = 'public'
  group by tablename
  order by tablename;
`)
console.table(policies)

console.log("\n=== 4. Trigger on auth.users ===")
const trigger = await q(`
  select tgname, tgrelid::regclass::text as on_table, tgenabled
  from pg_trigger
  where tgname = 'on_auth_user_created';
`)
console.log(trigger.length ? trigger : "NOT FOUND — migration 0005 did not install trigger")

console.log("\n=== 5. Seed function exists ===")
const fn = await q(`
  select proname, prosecdef
  from pg_proc
  where proname = 'seed_default_categories';
`)
console.log(fn.length ? fn : "NOT FOUND")

console.log("\n=== 6. updated_at triggers ===")
const uat = await q(`
  select tgname, tgrelid::regclass::text as on_table
  from pg_trigger
  where tgname like 'trg_%_updated_at'
  order by tgname;
`)
console.table(uat)

console.log("\n=== 7. Sample simulated insert (user A fake) — should PASS via service role ===")
// No real user yet; just verify schema accepts via service_role
const sim = await q(`
  explain (verbose false) insert into public.categories (user_id, name) values ('00000000-0000-0000-0000-000000000000', 'probe');
`)
console.log(sim.slice(0, 3))
