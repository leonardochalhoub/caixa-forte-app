"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"

export interface LifecycleEvent {
  id: number
  event_type: "deleted" | "reactivated"
  happened_at: string
  note: string | null
}

// Sets profile.deleted_at = now(), logs a "deleted" event, and ends the
// session. Data stays in the database; the user can reactivate by signing
// back in with the same email + password.
export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const db = untyped(admin)

  await db
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
  await db.from("account_lifecycle_events").insert({
    user_id: user.id,
    event_type: "deleted",
    note: "Solicitado pelo usuário em /app/profile.",
  })

  // Drop the current session cookie so the user is immediately signed out.
  const supabase = await createServerClient()
  await supabase.auth.signOut()

  // Belt-and-suspenders: clear every sb-* cookie so no stale JWT slips
  // through if the layout redirects before the signOut takes effect.
  const store = await cookies()
  for (const c of store.getAll()) {
    if (c.name.startsWith("sb-") || c.name.startsWith("__supabase")) {
      store.set(c.name, "", { path: "/", maxAge: 0, expires: new Date(0) })
    }
  }

  redirect("/?deleted=1")
}

// Called on every authenticated page load: if the profile is soft-deleted,
// reactivate it atomically (clear timestamp + log event) and let the user
// continue. Callers (layout, etc.) can read the returned flag to show a
// "bem-vindo de volta" toast.
export async function reactivateIfDeleted(
  userId: string,
): Promise<{ reactivated: boolean }> {
  const admin = createAdminClient()
  const db = untyped(admin)

  const { data: profile } = await db
    .from("profiles")
    .select("deleted_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (!profile?.deleted_at) return { reactivated: false }

  await db
    .from("profiles")
    .update({ deleted_at: null })
    .eq("user_id", userId)
  await db.from("account_lifecycle_events").insert({
    user_id: userId,
    event_type: "reactivated",
    note: "Usuário fez login novamente.",
  })
  return { reactivated: true }
}

export async function loadLifecycleEvents(): Promise<LifecycleEvent[]> {
  const user = await requireUser()
  const admin = createAdminClient()
  const db = untyped(admin)
  const { data } = await db
    .from("account_lifecycle_events")
    .select("id, event_type, happened_at, note")
    .eq("user_id", user.id)
    .order("happened_at", { ascending: false })
    .limit(50)
  return (data ?? []) as LifecycleEvent[]
}
