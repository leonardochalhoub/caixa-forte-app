#!/usr/bin/env node
// Dumps the user's full ledger to backups/ledger-<email>-<timestamp>.json,
// then (unless --dry) deletes every transaction + capture_message and resets
// opening_balance_cents to 0 on every account. Accounts and categories are
// preserved so the user can keep their structure and re-register entries.
//
// Usage:
//   node scripts/wipe-and-restart.mjs <email> [--dry]

import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"

const email = process.argv[2] ?? "leochalhoub@hotmail.com"
const dryRun = process.argv.includes("--dry")

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

const { data: userList } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
const user = userList.users.find((u) => u.email === email)
if (!user) {
  console.error(`❌ user ${email} not found`)
  process.exit(1)
}

console.log(`📋 ${dryRun ? "[DRY RUN] " : ""}wiping ledger for ${email} (${user.id})\n`)

// -------- dump --------
const [accounts, categories, transactions, captures] = await Promise.all([
  sb
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .then((r) => r.data ?? []),
  sb
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .then((r) => r.data ?? []),
  sb
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .then((r) => r.data ?? []),
  sb
    .from("capture_messages")
    .select("*")
    .eq("user_id", user.id)
    .then((r) => r.data ?? []),
])

const dump = {
  exportedAt: new Date().toISOString(),
  user: { id: user.id, email },
  accounts,
  categories,
  transactions,
  captures,
  summary: {
    accounts: accounts.length,
    categories: categories.length,
    transactions: transactions.length,
    captures: captures.length,
  },
}

mkdirSync("backups", { recursive: true })
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19)
const safeEmail = email.replace(/[^a-z0-9]/gi, "-")
const out = `backups/ledger-${safeEmail}-${stamp}.json`
writeFileSync(out, JSON.stringify(dump, null, 2))
console.log(`✅ backup escrito em ${out}`)
console.log(`   ${accounts.length} contas · ${categories.length} categorias · ${transactions.length} transações · ${captures.length} captures\n`)

if (dryRun) {
  console.log("🟡 --dry: nada foi apagado. Rode sem --dry pra executar o wipe.")
  process.exit(0)
}

// -------- wipe --------
const { error: capErr } = await sb
  .from("capture_messages")
  .delete()
  .eq("user_id", user.id)
if (capErr) {
  console.error("❌ erro apagando capture_messages:", capErr.message)
  process.exit(1)
}
console.log(`🗑️  capture_messages apagadas`)

const { error: txErr } = await sb
  .from("transactions")
  .delete()
  .eq("user_id", user.id)
if (txErr) {
  console.error("❌ erro apagando transactions:", txErr.message)
  process.exit(1)
}
console.log(`🗑️  transactions apagadas`)

const { error: accErr } = await sb
  .from("accounts")
  .update({ opening_balance_cents: 0 })
  .eq("user_id", user.id)
if (accErr) {
  console.error("❌ erro zerando opening_balance_cents:", accErr.message)
  process.exit(1)
}
console.log(`🗑️  opening_balance_cents zerados em ${accounts.length} contas`)

// -------- verify --------
const { count: txLeft } = await sb
  .from("transactions")
  .select("*", { count: "exact", head: true })
  .eq("user_id", user.id)
const { data: accsAfter } = await sb
  .from("accounts")
  .select("name, opening_balance_cents")
  .eq("user_id", user.id)

console.log(`\n✅ verificação:`)
console.log(`   transações restantes: ${txLeft}`)
console.log(`   contas com opening != 0: ${accsAfter.filter((a) => a.opening_balance_cents !== 0).length}`)
console.log(`\n💾 backup salvo em: ${out}`)
