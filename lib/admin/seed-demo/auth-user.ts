import type { City, SeedClient, SeedNote } from "./types"

export const DEMO_EMAIL = "larissa.demo@caixa-forte.app"
export const DEMO_PASSWORD = "DemoPublico#2026"
export const DEMO_NAME = "Larissa Oliveira"
export const DEMO_AVATAR_URL =
  "https://randomuser.me/api/portraits/women/79.jpg"

const DEMO_USER_METADATA = {
  display_name: DEMO_NAME,
  full_name: DEMO_NAME,
  avatar_url: DEMO_AVATAR_URL,
  picture: DEMO_AVATAR_URL,
}

// Cria ou atualiza o auth user da Larissa demo. Se já existe, só reseta
// senha e metadata. Retorna o userId final.
export async function ensureDemoAuthUser(
  sb: SeedClient,
  note: SeedNote,
): Promise<string> {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existing = list?.users?.find((u) => u.email === DEMO_EMAIL)
  if (existing) {
    const userId = existing.id
    await sb.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      user_metadata: DEMO_USER_METADATA,
    })
    note("auth", `atualizou ${userId}`)
    return userId
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: DEMO_USER_METADATA,
  })
  if (error || !data?.user) throw new Error(`createUser: ${error?.message}`)
  const userId = data.user.id
  note("auth", `criado ${userId}`)
  return userId
}

export async function upsertDemoProfile(
  sb: SeedClient,
  userId: string,
  picked: City,
  note: SeedNote,
): Promise<void> {
  const { error: profErr } = await sb.from("profiles").upsert(
    {
      user_id: userId,
      display_name: DEMO_NAME,
      is_demo: true,
      onboarded_at: new Date().toISOString(),
      city_name: picked.city,
      uf: picked.uf,
      lat: picked.lat,
      lng: picked.lng,
      gender: "F",
    },
    { onConflict: "user_id" },
  )
  if (profErr) throw new Error(`profile: ${profErr.message}`)
  note("profile", `cidade: ${picked.city}/${picked.uf}`)
}

export async function wipeDemoData(
  sb: SeedClient,
  userId: string,
  note: SeedNote,
): Promise<void> {
  await sb.from("transactions").delete().eq("user_id", userId)
  await sb.from("balance_adjustments").delete().eq("user_id", userId)
  await sb.from("balance_registries").delete().eq("user_id", userId)
  await sb.from("categories").delete().eq("user_id", userId)
  await sb.from("accounts").delete().eq("user_id", userId)
  note("wipe", "dados antigos removidos")
}
