#!/usr/bin/env node
// Applies the sysadmin-related migrations via Supabase Management API.
// Usage: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/apply-sysadmin-migrations.mjs
// When PAT is missing, prints the consolidated SQL so it can be pasted into
// Supabase Studio > SQL Editor.

import { readFileSync } from "node:fs"

const MIGRATIONS = [
  "supabase/migrations/0017_profile_location_role.sql",
  "supabase/migrations/0018_login_events.sql",
]

const sql = MIGRATIONS.map(
  (path) => `-- ===== ${path} =====\n${readFileSync(path, "utf8")}`,
).join("\n\n")

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF

if (!PAT || !REF) {
  console.log("# Run this in Supabase Studio > SQL Editor:\n")
  console.log(sql)
  process.exit(0)
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/database/query`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  },
)
console.log(`status: ${res.status}`)
console.log(await res.text())
