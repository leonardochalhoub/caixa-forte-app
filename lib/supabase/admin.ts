import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

let cached: ReturnType<typeof createClient<Database>> | null = null

/**
 * SECURITY: service-role client. Bypasses RLS.
 * Only use in: (1) Telegram webhook before link exists, (2) cron alerts, (3) seed.
 * Never import in client components.
 */
export function createAdminClient() {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client missing env vars")
  }
  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
