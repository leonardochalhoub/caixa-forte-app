#!/usr/bin/env node
// Apply a single named migration (or the latest) to the remote Supabase.
// Usage: node scripts/apply-one-migration.mjs <migration-filename>
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
const path = resolve("supabase/migrations", name)
const sql = await readFile(path, "utf8")

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
})
console.log(`${res.status}: ${await res.text()}`)
