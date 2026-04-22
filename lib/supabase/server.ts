import { createServerClient as createSSRClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./database.types"

export async function createServerClient() {
  const cookieStore = await cookies()

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // server component context — setAll no-op
          }
        },
      },
    },
  )
}
