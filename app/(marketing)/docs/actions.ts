"use server"

import { z } from "zod"
import { getUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"

// Fire-and-forget click logger. Public — anonymous landing-page clicks are
// welcome (user_id stays NULL). Uses admin client so RLS is bypassed even
// when there's no session, and silently swallows errors so a failing beacon
// never breaks navigation.
const TrackSchema = z.object({
  source: z.enum(["main", "profile"]),
})

export async function trackDocClickAction(
  input: z.infer<typeof TrackSchema>,
): Promise<void> {
  try {
    const parsed = TrackSchema.parse(input)
    const user = await getUser()
    const admin = createAdminClient()
    await untyped(admin).from("doc_clicks").insert({
      user_id: user?.id ?? null,
      source: parsed.source,
    })
  } catch {
    /* swallow */
  }
}
