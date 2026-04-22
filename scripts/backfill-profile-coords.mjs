#!/usr/bin/env node
// Geocodes city_name + uf for every profile that has them but no lat/lng
// yet. Idempotent — re-running skips rows that already have coords.
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

async function geocode(name, uf) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
  url.searchParams.set("name", name)
  url.searchParams.set("country", "BR")
  url.searchParams.set("language", "pt")
  url.searchParams.set("count", "10")
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const hits = json.results ?? []
  if (hits.length === 0) return null
  const exact = hits.find(
    (h) =>
      (h.admin1_code ?? "").toUpperCase() === uf.toUpperCase() ||
      (h.admin1 ?? "").toUpperCase().startsWith(uf.toUpperCase()),
  )
  const pick = exact ?? hits[0]
  return { lat: pick.latitude, lng: pick.longitude }
}

const { data: rows } = await sb
  .from("profiles")
  .select("user_id, city_name, uf, lat, lng")
  .not("city_name", "is", null)
  .not("uf", "is", null)

console.log(`checking ${rows?.length ?? 0} profiles…`)
for (const r of rows ?? []) {
  if (r.lat && r.lng) {
    console.log(`  skip ${r.city_name}/${r.uf} (already has coords)`)
    continue
  }
  const c = await geocode(r.city_name, r.uf)
  if (!c) {
    console.log(`  ❌ ${r.city_name}/${r.uf} (no geocoder hit)`)
    continue
  }
  const { error } = await sb
    .from("profiles")
    .update({ lat: c.lat, lng: c.lng })
    .eq("user_id", r.user_id)
  if (error) {
    console.log(`  ❌ ${r.city_name}/${r.uf}: ${error.message}`)
  } else {
    console.log(`  ✓ ${r.city_name}/${r.uf} → ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`)
  }
  await new Promise((r) => setTimeout(r, 250))
}
