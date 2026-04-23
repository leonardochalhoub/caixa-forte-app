#!/usr/bin/env node
// Restores a ledger from a backup JSON created by wipe-and-restart.mjs.
// Overwrites opening_balance_cents on existing accounts and re-inserts the
// transactions + capture_messages with their original IDs and timestamps.
//
// Usage:
//   node scripts/restore-ledger.mjs <backup-file.json>

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const backupFile = process.argv[2]
if (!backupFile) {
  console.error("usage: node scripts/restore-ledger.mjs <backup-file.json>")
  process.exit(1)
}

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

const dump = JSON.parse(readFileSync(backupFile, "utf8"))
const uid = dump.user.id
console.log(`📥 restaurando ledger de ${dump.user.email} (${uid})`)
console.log(`   backup de ${dump.exportedAt}`)
console.log(`   ${dump.summary.accounts} contas · ${dump.summary.transactions} transações · ${dump.summary.captures} captures\n`)

// 1. opening balances — upsert pelo id
for (const a of dump.accounts) {
  const { error } = await sb
    .from("accounts")
    .update({ opening_balance_cents: a.opening_balance_cents })
    .eq("id", a.id)
    .eq("user_id", uid)
  if (error) {
    console.error(`  ❌ ${a.name}: ${error.message}`)
    continue
  }
  console.log(
    `  ✓ ${a.name.padEnd(32)} opening ${(a.opening_balance_cents / 100).toFixed(2)}`,
  )
}

// 2. limpa transações/captures atuais (caso haja — garantia)
await sb.from("capture_messages").delete().eq("user_id", uid)
await sb.from("transactions").delete().eq("user_id", uid)

// 3. re-insere transações com IDs originais.
//    needs_review é coluna GERADA — stripar antes do insert.
const GENERATED_COLS = ["needs_review"]
const stripGenerated = (row) => {
  const clean = { ...row }
  for (const c of GENERATED_COLS) delete clean[c]
  return clean
}
if (dump.transactions.length) {
  const { error } = await sb
    .from("transactions")
    .insert(dump.transactions.map(stripGenerated))
  if (error) {
    console.error(`  ❌ transactions: ${error.message}`)
    process.exit(1)
  }
  console.log(`\n  ✓ ${dump.transactions.length} transações restauradas`)
}

// 4. re-insere captures
if (dump.captures.length) {
  const { error } = await sb.from("capture_messages").insert(dump.captures)
  if (error) {
    console.error(`  ❌ captures: ${error.message}`)
    process.exit(1)
  }
  console.log(`  ✓ ${dump.captures.length} capture_messages restaurados`)
}

console.log(`\n✅ restore completo.`)
