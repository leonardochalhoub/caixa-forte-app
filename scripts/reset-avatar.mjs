#!/usr/bin/env node
// Clears any stale avatar_url data-URL from user_metadata so the new
// storage-backed flow can take over cleanly.
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
  auth: { persistSession: false, autoRefreshToken: false },
})

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"

const { data: current } = await sb.auth.admin.getUserById(UID)
const meta = current?.user?.user_metadata ?? {}
const avatar = meta.avatar_url
const isDataUrl = typeof avatar === "string" && avatar.startsWith("data:")
console.log(
  `current avatar_url: ${
    typeof avatar === "string" ? `${avatar.length} chars${isDataUrl ? " (data URL)" : ""}` : avatar
  }`,
)

if (isDataUrl || (typeof avatar === "string" && avatar.length > 2000)) {
  const { error } = await sb.auth.admin.updateUserById(UID, {
    user_metadata: { ...meta, avatar_url: null },
  })
  if (error) throw error
  console.log("✓ cleared stale avatar_url")
} else {
  console.log("nothing to clear")
}
