#!/usr/bin/env node
// Deleta usuários que nunca confirmaram email em > 2 dias.
// Safeguards: lista antes, pede confirmação (exceto com --yes),
// pula quem já confirmou ou é recém-criado.
//
// Usage:
//   node scripts/cleanup-unconfirmed.mjs [--dry] [--yes] [--days=2]

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { createInterface } from "node:readline"

const args = new Set(process.argv.slice(2))
const dry = args.has("--dry")
const assumeYes = args.has("--yes")
const daysArg = process.argv.find((a) => a.startsWith("--days="))
const GRACE_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 2

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

const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)
console.log(`🧹 Cleanup ${dry ? "[DRY] " : ""}— deletando unconfirmed criados antes de ${cutoff.toISOString()}\n`)

const allUsers = []
for (let page = 1; page <= 10; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) {
    console.error("erro listando:", error.message)
    process.exit(1)
  }
  allUsers.push(...data.users)
  if (data.users.length < 200) break
}

const toDelete = allUsers.filter((u) => {
  if (u.email_confirmed_at) return false
  const created = new Date(u.created_at)
  return created < cutoff
})

if (toDelete.length === 0) {
  console.log("✅ nada a deletar.")
  process.exit(0)
}

console.log(`${toDelete.length} usuários a deletar:`)
for (const u of toDelete) {
  const ageDays = Math.floor(
    (Date.now() - new Date(u.created_at).getTime()) / (24 * 60 * 60 * 1000),
  )
  console.log(
    `  ${u.email ?? u.id}  (criado há ${ageDays}d · ${u.created_at.slice(0, 16)})`,
  )
}
console.log()

if (dry) {
  console.log("🟡 --dry — nada apagado.")
  process.exit(0)
}

if (!assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await new Promise((r) => rl.question("Confirmar delete? [y/N] ", r))
  rl.close()
  if (!/^y(es)?$/i.test(ans.trim())) {
    console.log("abortado.")
    process.exit(0)
  }
}

let ok = 0
let fail = 0
for (const u of toDelete) {
  const { error } = await sb.auth.admin.deleteUser(u.id)
  if (error) {
    console.error(`❌ ${u.email}: ${error.message}`)
    fail++
  } else {
    console.log(`✓ ${u.email}`)
    ok++
  }
}
console.log(`\n${ok} deletados · ${fail} falhas`)
