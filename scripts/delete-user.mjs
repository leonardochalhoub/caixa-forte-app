#!/usr/bin/env node
// Hard-delete one or more auth users plus every row that references them
// via ON DELETE CASCADE (profiles, accounts, transactions, categories,
// login_events, etc.). Run with the exact emails you want gone.
//
// Usage:
//   node scripts/delete-user.mjs email1@x.com [email2@x.com ...]
//   node scripts/delete-user.mjs --dry email1@x.com   # preview only

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const emails = args
  .filter((a) => !a.startsWith("--"))
  .map((e) => e.toLowerCase().trim())
  .filter(Boolean)

if (emails.length === 0) {
  console.error("usage: node scripts/delete-user.mjs [--dry] email [email ...]")
  process.exit(2)
}

console.log(`targets: ${emails.join(", ")}${dry ? " (DRY RUN)" : ""}\n`)

// Fetch all users once — Supabase admin doesn't expose a by-email endpoint.
// 1000 is enough for this app; bump the perPage if you ever need more.
const { data: authList, error: listErr } = await sb.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})
if (listErr) throw listErr

const matches = authList.users.filter((u) =>
  u.email ? emails.includes(u.email.toLowerCase()) : false,
)

if (matches.length === 0) {
  console.log("No matching users found.")
  process.exit(0)
}

console.log(`Found ${matches.length} matching user(s):`)
for (const u of matches) {
  console.log(`  ${u.email}  id=${u.id}  created=${u.created_at}`)
}

// Report the rows that will cascade-delete so the dry run is informative.
for (const u of matches) {
  async function safeCount(table) {
    try {
      const r = await sb.from(table).select("id", { count: "exact", head: true }).eq("user_id", u.id)
      return r.count ?? 0
    } catch {
      return 0
    }
  }
  const [acc, tx, cats, caps, logins] = await Promise.all([
    safeCount("accounts"),
    safeCount("transactions"),
    safeCount("categories"),
    safeCount("capture_messages"),
    safeCount("login_events"),
  ])
  console.log(
    `    ↳ ${u.email}: accounts=${acc} tx=${tx} cats=${cats} captures=${caps} logins=${logins}`,
  )
}

if (dry) {
  console.log("\nDRY RUN — nothing was deleted. Re-run without --dry to proceed.")
  process.exit(0)
}

console.log("\nDeleting…")
for (const u of matches) {
  const { error } = await sb.auth.admin.deleteUser(u.id)
  if (error) {
    console.error(`  ❌ ${u.email}: ${error.message}`)
  } else {
    console.log(`  ✓ deleted ${u.email}`)
  }
}
console.log("done.")
