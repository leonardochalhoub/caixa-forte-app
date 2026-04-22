import { redirect } from "next/navigation"
import type { AccountType } from "@/lib/types"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatDisplayName, isEmailFallbackName } from "@/lib/format-name"
import { OnboardingWizard } from "./_components/OnboardingWizard"

export default async function OnboardingPage() {
  const user = await requireUser()
  const supabase = await createServerClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, display_name")
    .eq("user_id", user.id)
    .maybeSingle()

  if (profile?.onboarded_at) redirect("/app")

  const [{ data: accounts }, { data: existingCats }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    supabase.from("categories").select("id").eq("user_id", user.id).limit(1),
  ])

  const accountCount = accounts?.length ?? 0
  const hasCategories = (existingCats ?? []).length > 0
  const nameIsFallback = isEmailFallbackName(profile?.display_name, user.email)
  const hasExplicitName = !!profile?.display_name && !nameIsFallback
  const hasGroqKey = !!process.env.GROQ_API_KEY

  const initialStep: 0 | 1 | 2 | 3 =
    hasCategories && hasExplicitName
      ? 3
      : accountCount >= 1 && hasExplicitName
        ? 2
        : hasExplicitName
          ? 1
          : 0

  const initialName = hasExplicitName ? formatDisplayName(profile?.display_name) : ""

  return (
    <OnboardingWizard
      userId={user.id}
      displayName={initialName}
      existingAccounts={(accounts ?? []).map((a) => ({ ...a, type: a.type as AccountType }))}
      hasCategories={hasCategories}
      hasGroqKey={hasGroqKey}
      initialStep={initialStep}
    />
  )
}
