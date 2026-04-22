#!/usr/bin/env node
// One-shot: apply local migrations to remote Supabase via Management API.
// Usage: SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xyz node scripts/apply-migrations.mjs [migration_glob]

import { readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!PAT || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF")
  process.exit(2)
}

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

const dir = resolve("supabase/migrations")
const files = (await readdir(dir))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.startsWith("_"))
  .sort()

console.log(`Applying ${files.length} migrations to project ${REF}...\n`)

for (const f of files) {
  const fullPath = join(dir, f)
  const sql = await readFile(fullPath, "utf8")
  process.stdout.write(`→ ${f} ... `)
  try {
    const { status, body } = await runQuery(sql)
    if (status >= 200 && status < 300) {
      console.log(`OK (${body.length < 200 ? body : body.slice(0, 200) + "..."})`)
    } else {
      console.log(`FAIL [${status}]`)
      console.error(body)
      process.exit(1)
    }
  } catch (err) {
    console.log("THREW")
    console.error(err)
    process.exit(1)
  }
}

console.log("\nAll migrations applied.")
