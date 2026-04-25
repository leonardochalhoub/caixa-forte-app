#!/usr/bin/env node
// Aplica todas as migrations pendentes (em ordem alfabética) na prod.
// Compara o filesystem (supabase/migrations/*.sql) com a tabela
// public._applied_migrations e roda só o que falta.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxxxx \
//     node scripts/apply-pending.mjs
//
// Se SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF estiverem em .env.local,
// um wrapper simples basta: `set -a; source .env.local; set +a; node scripts/apply-pending.mjs`

import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!PAT || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in env.")
  console.error("Add them to .env.local and re-run with `set -a; source .env.local; set +a; node scripts/apply-pending.mjs`")
  process.exit(2)
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`

async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const migrationsDir = resolve("supabase/migrations")
const allFiles = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
  .sort()

console.log(`Found ${allFiles.length} migration files in supabase/migrations/`)

// Detecta se a tabela _applied_migrations existe. Se não existe, é
// porque 0033 ainda não rodou — nesse caso, aplica 0033 antes de tudo.
const tableExists = await runSql(
  `select exists(select 1 from information_schema.tables where table_schema='public' and table_name='_applied_migrations') as exists;`,
)
const hasTracking = tableExists?.[0]?.exists === true

if (!hasTracking) {
  const bootstrap = "0033_migration_tracking.sql"
  if (!allFiles.includes(bootstrap)) {
    console.error(`Tracking table missing and ${bootstrap} not found. Aborting.`)
    process.exit(1)
  }
  console.log(`Bootstrap: applying ${bootstrap} to create tracking table...`)
  const sql = await readFile(resolve(migrationsDir, bootstrap), "utf8")
  await runSql(sql)
  console.log(`  ✓ ${bootstrap} (bootstrap done)`)
}

const appliedRows = await runSql(
  `select filename from public._applied_migrations;`,
)
const applied = new Set(appliedRows.map((r) => r.filename))
console.log(`Already applied: ${applied.size}`)

const pending = allFiles.filter((f) => !applied.has(f))
if (pending.length === 0) {
  console.log("✓ Nothing to apply. Schema up to date.")
  process.exit(0)
}

console.log(`Pending: ${pending.length}`)
for (const f of pending) console.log(`  - ${f}`)

let appliedCount = 0
for (const filename of pending) {
  console.log(`\nApplying ${filename}...`)
  const sql = await readFile(resolve(migrationsDir, filename), "utf8")
  try {
    await runSql(sql)
  } catch (err) {
    console.error(`  ✗ ${filename} FAILED: ${err.message}`)
    console.error(`  Stopping. Fix the migration and re-run apply-pending.`)
    process.exit(1)
  }
  // Escapa aspa simples no nome só por garantia (filenames bem-comportados não precisam).
  const safeName = filename.replace(/'/g, "''")
  await runSql(
    `insert into public._applied_migrations (filename) values ('${safeName}') on conflict do nothing;`,
  )
  console.log(`  ✓ ${filename}`)
  appliedCount++
}

console.log(`\nApplied ${appliedCount} migration(s).`)
