import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { loadLifecycleEvents } from "./lifecycle"
import { ProfileForm } from "./_components/ProfileForm"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, telegram_chat_id")
    .eq("user_id", user.id)
    .maybeSingle()

  type Extended = {
    city_ibge?: number | null
    city_name?: string | null
    uf?: string | null
    gender?: "M" | "F" | null
    birthday?: string | null
  }
  let extended: Extended | null = null
  try {
    const locRes = await untyped(supabase)
      .from("profiles")
      .select("city_ibge, city_name, uf, gender, birthday")
      .eq("user_id", user.id)
      .maybeSingle()
    extended = (locRes.data ?? null) as Extended | null
  } catch {
    extended = null
  }

  const lifecycleEvents = await loadLifecycleEvents().catch(() => [])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold text-strong">Perfil</h1>
      <ProfileForm
        email={user.email ?? ""}
        displayName={profile?.display_name ?? ""}
        telegramLinked={!!profile?.telegram_chat_id}
        avatarUrl={
          (user.user_metadata as { avatar_url?: string; picture?: string } | null)
            ?.avatar_url ??
          (user.user_metadata as { avatar_url?: string; picture?: string } | null)
            ?.picture ??
          null
        }
        initialCity={
          extended?.city_ibge && extended.city_name && extended.uf
            ? {
                ibge_id: Number(extended.city_ibge),
                name: extended.city_name,
                uf: extended.uf,
              }
            : null
        }
        initialGender={
          extended?.gender === "M" || extended?.gender === "F" ? extended.gender : null
        }
        initialBirthday={extended?.birthday ?? null}
        lifecycleEvents={lifecycleEvents}
      />
    </div>
  )
}
