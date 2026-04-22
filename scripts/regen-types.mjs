#!/usr/bin/env node
import { writeFile } from "node:fs/promises"

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${PAT}` } },
)
const json = await res.json()
if (typeof json.types !== "string") {
  console.error("unexpected:", json)
  process.exit(1)
}
await writeFile("lib/supabase/database.types.ts", json.types)
console.log("types regenerated,", json.types.split("\n").length, "lines")
