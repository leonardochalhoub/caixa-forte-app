#!/usr/bin/env node
// Shows every profile + its location/coords state, so we can see exactly
// why a given user might not be rendering on the sysadmin map.
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

const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
const { data: profiles } = await sb
  .from("profiles")
  .select("user_id, display_name, city_ibge, city_name, uf, lat, lng, gender, onboarded_at, deleted_at")

const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]))

for (const u of users.users) {
  const p = byUser.get(u.id) ?? {}
  const status =
    p.deleted_at ? "DELETED"
    : !p.onboarded_at ? "not-onboarded"
    : "active"
  console.log(
    `${u.email?.padEnd(36) ?? "?".padEnd(36)} · ${status.padEnd(14)} · ${p.display_name ?? "no-name"}`,
  )
  console.log(
    `    city="${p.city_name ?? "?"}"  uf="${p.uf ?? "?"}"  ibge=${p.city_ibge ?? "?"}  lat=${p.lat ?? "?"}  lng=${p.lng ?? "?"}  gender=${p.gender ?? "?"}`,
  )
}
