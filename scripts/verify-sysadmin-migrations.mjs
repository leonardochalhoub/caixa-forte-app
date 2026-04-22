#!/usr/bin/env node
// Verifies migrations 0017 + 0018 landed by probing the new columns/tables
// via the service-role client.
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

const { data: profilesCheck, error: pErr } = await sb
  .from("profiles")
  .select("user_id, role, city_ibge, city_name, uf")
  .limit(5)
console.log("profiles probe:", pErr?.message ?? "ok")
console.log(profilesCheck)

const { data: eventsCheck, error: eErr } = await sb
  .from("login_events")
  .select("id, user_id, happened_at")
  .limit(1)
console.log("login_events probe:", eErr?.message ?? "ok")
console.log(eventsCheck)
