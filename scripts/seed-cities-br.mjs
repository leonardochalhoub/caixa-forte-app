#!/usr/bin/env node
// Seeds public.cities_br with every Brazilian municipality + lat/lng.
// Source: https://github.com/kelvins/municipios-brasileiros (public domain,
// maintained, 5570 rows matching IBGE). Idempotent — upserts by ibge_id.
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

const URL_MUNICIPIOS =
  "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json"
const URL_ESTADOS =
  "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/estados.json"

console.log("fetching estados…")
const estadosRes = await fetch(URL_ESTADOS)
if (!estadosRes.ok) throw new Error(`estados ${estadosRes.status}`)
const estados = await estadosRes.json()
const ufById = new Map(estados.map((e) => [e.codigo_uf, e.uf]))
console.log(`  loaded ${estados.length} estados`)

console.log("fetching municípios…")
const munRes = await fetch(URL_MUNICIPIOS)
if (!munRes.ok) throw new Error(`municípios ${munRes.status}`)
const municipios = await munRes.json()
console.log(`  loaded ${municipios.length} municípios`)

const rows = municipios
  .map((m) => ({
    ibge_id: m.codigo_ibge,
    name: m.nome,
    uf: ufById.get(m.codigo_uf) ?? null,
    lat: m.latitude,
    lng: m.longitude,
    capital: !!m.capital,
  }))
  .filter((r) => r.uf && typeof r.lat === "number" && typeof r.lng === "number")

console.log(`inserting ${rows.length} cities in batches of 500…`)
const BATCH = 500
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH)
  const { error } = await sb
    .from("cities_br")
    .upsert(slice, { onConflict: "ibge_id" })
  if (error) {
    console.error("batch failed:", error.message)
    process.exit(1)
  }
  inserted += slice.length
  process.stdout.write(`\r  ${inserted}/${rows.length}`)
}
process.stdout.write("\n")
console.log("✓ done")

const { count } = await sb
  .from("cities_br")
  .select("*", { count: "exact", head: true })
console.log(`final row count: ${count}`)
