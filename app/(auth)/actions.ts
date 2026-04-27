"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { requireUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export async function recordLoginAction(): Promise<void> {
  const user = await requireUser()
  const h = await headers()
  const fwd = h.get("x-forwarded-for")
  const ipRaw =
    (fwd ? fwd.split(",")[0]?.trim() : null) ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null
  // Hash o IP antes de gravar (LGPD) — mesmo padrão do heartbeat.
  const ip = ipRaw ? Buffer.from(ipRaw).toString("base64").slice(0, 24) : null
  const ua = h.get("user-agent")?.slice(0, 512) ?? null

  const admin = createAdminClient()
  await admin
    .from("login_events")
    .insert({ user_id: user.id, ip, user_agent: ua })
}

const SaveProfileLocationSchema = z.object({
  ibgeId: z.number().int().positive(),
  cityName: z.string().trim().min(1).max(120),
  uf: z.string().trim().length(2),
})

async function coordsFromCitiesTable(
  ibgeId: number,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("cities_br")
      .select("lat, lng")
      .eq("ibge_id", ibgeId)
      .maybeSingle()
    if (data?.lat != null && data?.lng != null) {
      return { lat: Number(data.lat), lng: Number(data.lng) }
    }
  } catch {
    /* table may not exist yet; fall through to geocoder */
  }
  return null
}

async function geocodeCityBR(
  name: string,
  uf: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", name)
    url.searchParams.set("country", "BR")
    url.searchParams.set("language", "pt")
    url.searchParams.set("count", "10")
    const res = await fetch(url.toString(), {
      next: { revalidate: 60 * 60 * 24 * 30 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      results?: Array<{
        latitude: number
        longitude: number
        admin1_code?: string
        admin1?: string
      }>
    }
    const hits = json.results ?? []
    if (hits.length === 0) return null
    // Prefer exact UF match when available; fall back to first result.
    const exact = hits.find(
      (h) =>
        (h.admin1_code ?? "").toUpperCase() === uf.toUpperCase() ||
        (h.admin1 ?? "").toUpperCase().startsWith(uf.toUpperCase()),
    )
    const pick = exact ?? hits[0]!
    return { lat: pick.latitude, lng: pick.longitude }
  } catch {
    return null
  }
}

export async function saveProfileLocationAction(
  input: z.infer<typeof SaveProfileLocationSchema>,
): Promise<void> {
  const user = await requireUser()
  const parsed = SaveProfileLocationSchema.parse(input)
  const admin = createAdminClient()
  const coords =
    (await coordsFromCitiesTable(parsed.ibgeId)) ??
    (await geocodeCityBR(parsed.cityName, parsed.uf))
  const { error } = await admin
    .from("profiles")
    .update({
      city_ibge: parsed.ibgeId,
      city_name: parsed.cityName,
      uf: parsed.uf.toUpperCase(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    .eq("user_id", user.id)
  if (error) {
    const msg = error.message ?? ""
    if (
      msg.includes("city_ibge") ||
      msg.includes("city_name") ||
      msg.includes("schema cache")
    ) {
      throw new Error(
        "Cidade ainda não pode ser salva: o banco precisa receber a migração 0017. Rode o SQL em Supabase Studio.",
      )
    }
    throw new Error(msg)
  }
}

const SaveGenderSchema = z.object({
  gender: z.enum(["M", "F"]),
})

export async function saveProfileGenderAction(
  input: z.infer<typeof SaveGenderSchema>,
): Promise<void> {
  const user = await requireUser()
  const parsed = SaveGenderSchema.parse(input)
  const admin = createAdminClient()
  const { error } = await admin
    .from("profiles")
    .update({ gender: parsed.gender })
    .eq("user_id", user.id)
  if (error) throw new Error(error.message ?? "gender save failed")
}

const SaveBirthdaySchema = z.object({
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function saveProfileBirthdayAction(
  input: z.infer<typeof SaveBirthdaySchema>,
): Promise<void> {
  const user = await requireUser()
  const parsed = SaveBirthdaySchema.parse(input)
  const admin = createAdminClient()
  const { error } = await admin
    .from("profiles")
    .update({ birthday: parsed.birthday })
    .eq("user_id", user.id)
  if (error) throw new Error(error.message ?? "birthday save failed")
}
