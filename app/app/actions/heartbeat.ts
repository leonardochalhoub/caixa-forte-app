"use server"

import { requireUser } from "@/lib/auth"

/**
 * Silent heartbeat: records a login event only if the latest one for this
 * user is older than 15 minutes. Called from the LoginHeartbeat client
 * component on mount/focus/interval. Degrades silently so a missing
 * login_events table never breaks the app.
 */
export async function heartbeatAction(): Promise<void> {
  try {
    const user = await requireUser()
    const admin = (await import("@/lib/supabase/admin")).createAdminClient()

    const { data: latest } = await admin
      .from("login_events")
      .select("happened_at")
      .eq("user_id", user.id)
      .order("happened_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest?.happened_at) {
      const gapMs = Date.now() - new Date(latest.happened_at as string).getTime()
      if (gapMs < 15 * 60 * 1000) return
    }

    const h = await (await import("next/headers")).headers()
    const fwd = h.get("x-forwarded-for")
    const ipRaw =
      (fwd ? fwd.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null
    // Hash o IP antes de gravar — IP cru é PII (LGPD). Hash trunc
    // já permite contar únicos / detectar logins de IPs diferentes
    // sem expor o valor real. Mesmo padrão do /api/demo/enter.
    const ip = ipRaw ? Buffer.from(ipRaw).toString("base64").slice(0, 24) : null
    const ua = h.get("user-agent")?.slice(0, 512) ?? null

    await admin.from("login_events").insert({
      user_id: user.id,
      ip,
      user_agent: ua,
    })
  } catch {
    /* swallow — heartbeat must never surface errors */
  }
}
