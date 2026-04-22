#!/usr/bin/env node
// Merges duplicate "Renda" top-level categories: the longer name variant
// ("Renda (entrada)") is consolidated into the shorter ("Renda"). Any
// subcategories pointing to the loser are re-parented, any transactions
// tagged with the loser are retagged, then the loser is deleted.
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

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"

const { data: cats } = await sb
  .from("categories")
  .select("id, name, parent_id, is_income, is_formal_income, archived_at")
  .eq("user_id", UID)
  .is("parent_id", null)

const rendas = (cats ?? []).filter((c) => /^renda\b/i.test(c.name))
console.log("'Renda*' top-levels found:")
for (const c of rendas) {
  console.log(
    `  ${c.id} · ${JSON.stringify(c.name)} · income=${c.is_income} · formal=${c.is_formal_income} · archived=${!!c.archived_at}`,
  )
}
if (rendas.length < 2) {
  console.log("nothing to dedup")
  process.exit(0)
}

// Keeper = shortest name, tiebreaker = not archived, then earliest id.
rendas.sort((a, b) => {
  if (a.archived_at && !b.archived_at) return 1
  if (!a.archived_at && b.archived_at) return -1
  if (a.name.length !== b.name.length) return a.name.length - b.name.length
  return a.id.localeCompare(b.id)
})
const keeper = rendas[0]
const losers = rendas.slice(1)
console.log(`\nkeeper: ${keeper.id} (${JSON.stringify(keeper.name)})`)
console.log(`losers: ${losers.length}`)

for (const loser of losers) {
  // Existing keeper's subcategories, keyed by (lowercased) name so we can
  // merge collisions instead of trying to INSERT duplicates.
  const { data: keeperSubs } = await sb
    .from("categories")
    .select("id, name")
    .eq("user_id", UID)
    .eq("parent_id", keeper.id)
  const keeperByName = new Map(
    (keeperSubs ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  )

  const { data: loserSubs } = await sb
    .from("categories")
    .select("id, name")
    .eq("user_id", UID)
    .eq("parent_id", loser.id)

  for (const sub of loserSubs ?? []) {
    const collidingId = keeperByName.get(sub.name.toLowerCase())
    if (collidingId) {
      // Collision — retag transactions onto the existing keeper-sub and
      // delete the loser-sub so the re-parent pass doesn't trip the
      // unique constraint.
      const { error: retag } = await sb
        .from("transactions")
        .update({ category_id: collidingId })
        .eq("user_id", UID)
        .eq("category_id", sub.id)
      if (retag) throw retag
      const { error: del } = await sb
        .from("categories")
        .delete()
        .eq("user_id", UID)
        .eq("id", sub.id)
      if (del) throw del
      console.log(`    ✓ merged duplicate subcat "${sub.name}"`)
    } else {
      const { error: reparent } = await sb
        .from("categories")
        .update({ parent_id: keeper.id })
        .eq("id", sub.id)
      if (reparent) throw reparent
      console.log(`    ✓ re-parented subcat "${sub.name}"`)
    }
  }

  const { error: retag } = await sb
    .from("transactions")
    .update({ category_id: keeper.id })
    .eq("user_id", UID)
    .eq("category_id", loser.id)
  if (retag) throw retag
  const { error: del } = await sb
    .from("categories")
    .delete()
    .eq("user_id", UID)
    .eq("id", loser.id)
  if (del) throw del
  console.log(`  ✓ merged ${loser.id} → ${keeper.id}`)
}

// Ensure the keeper stays marked as formal income.
if (!keeper.is_formal_income) {
  const { error } = await sb
    .from("categories")
    .update({ is_formal_income: true })
    .eq("id", keeper.id)
  if (error) throw error
  console.log("  ✓ set keeper.is_formal_income = true")
}
console.log("done.")
