import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"

interface PendingMeta {
  pending_city_ibge?: number
  pending_city_name?: string
  pending_uf?: string
  pending_gender?: "M" | "F"
}

/**
 * On first authenticated pageload after email-confirmation signup, copy
 * the city + gender from user_metadata (where they survived the
 * cross-device hop) into the profile row, then clear the pending_* keys.
 *
 * Safe to call on every request — if there's nothing to sync (already
 * cleared, or user signed up with a session token) this short-circuits.
 */
export async function syncPendingProfileFromMetadata(user: User): Promise<void> {
  const meta = (user.user_metadata ?? {}) as PendingMeta & Record<string, unknown>
  const hasAny =
    meta.pending_city_ibge ||
    meta.pending_city_name ||
    meta.pending_uf ||
    meta.pending_gender
  if (!hasAny) return

  const admin = createAdminClient()
  const db = untyped(admin)

  // Geocode if we have a city but no coords yet.
  let coords: { lat: number; lng: number } | null = null
  if (meta.pending_city_ibge) {
    try {
      const { data } = await db
        .from("cities_br")
        .select("lat, lng")
        .eq("ibge_id", meta.pending_city_ibge)
        .maybeSingle()
      if (data?.lat != null && data?.lng != null) {
        coords = { lat: Number(data.lat), lng: Number(data.lng) }
      }
    } catch {
      /* cities_br may not be seeded — leave coords null, fallback kicks in on the map */
    }
  }

  const profileUpdate: Record<string, unknown> = {}
  if (meta.pending_city_ibge) profileUpdate.city_ibge = meta.pending_city_ibge
  if (meta.pending_city_name) profileUpdate.city_name = meta.pending_city_name
  if (meta.pending_uf) profileUpdate.uf = meta.pending_uf.toUpperCase()
  if (coords) {
    profileUpdate.lat = coords.lat
    profileUpdate.lng = coords.lng
  }
  if (meta.pending_gender) profileUpdate.gender = meta.pending_gender

  if (Object.keys(profileUpdate).length > 0) {
    await db.from("profiles").update(profileUpdate).eq("user_id", user.id)
  }

  // Strip the pending_* keys so we don't keep trying on every request.
  const cleanedMeta = { ...meta }
  delete cleanedMeta.pending_city_ibge
  delete cleanedMeta.pending_city_name
  delete cleanedMeta.pending_uf
  delete cleanedMeta.pending_gender
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: cleanedMeta,
  })
}
