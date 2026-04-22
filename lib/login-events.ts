import type { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"

// Records a login event server-side. Uses the admin client so the row lands
// even when the session is still materializing. IP pulled from the standard
// proxy headers; falls back to null when the deployment doesn't forward them.
export async function logLoginEvent(userId: string, request?: NextRequest | Request) {
  const admin = createAdminClient()
  const ip = request ? extractIp(request) : null
  const ua = request ? request.headers.get("user-agent") : null
  await untyped(admin).from("login_events").insert({
    user_id: userId,
    ip,
    user_agent: ua?.slice(0, 512) ?? null,
  })
}

function extractIp(request: NextRequest | Request): string | null {
  const h = request.headers
  const fwd = h.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim() || null
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || null
}
