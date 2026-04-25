#!/usr/bin/env node
// Apply a single named migration to the remote Supabase, then record
// it in public._applied_migrations (cria a tabela se necessário).
// Usage: node scripts/apply-one-migration.mjs <migration-filename>
//
// Para aplicar um conjunto pendente em ordem, prefira apply-pending.mjs.
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!PAT || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF")
  process.exit(2)
}
const name = process.argv[2]
if (!name) {
  console.error("Usage: node scripts/apply-one-migration.mjs <filename>")
  process.exit(2)
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`
async function runSql(query) {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

const sql = await readFile(resolve("supabase/migrations", name), "utf8")
await runSql(sql)
console.log(`✓ Applied ${name}`)

// Best-effort: registra no tracking. Se a tabela não existe (ex:
// rodando 0033 pela primeira vez), o INSERT falha silencioso — 0033
// se auto-registra via backfill.
const safe = name.replace(/'/g, "''")
try {
  await runSql(
    `insert into public._applied_migrations (filename) values ('${safe}') on conflict do nothing;`,
  )
  console.log(`  recorded in public._applied_migrations`)
} catch (err) {
  console.log(`  (tracking insert skipped: ${err.message.split('\\n')[0]})`)
}
