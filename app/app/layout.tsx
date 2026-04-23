import Link from "next/link"
import { isAdminish, requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { reactivateIfDeleted } from "./profile/lifecycle"
import { Footer } from "@/components/footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { formatShortName } from "@/lib/format-name"
import { AppNav } from "./_components/AppNav"
import { LoginHeartbeat } from "./_components/LoginHeartbeat"
import { ProfileMenu } from "./_components/ProfileMenu"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser()
  // Silently reactivate any previously-deleted account on the next request
  // after the user signs back in with the same email+password.
  await reactivateIfDeleted(user.id)
  const supabase = await createServerClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle()

  const shortName = formatShortName(profile?.display_name) || user.email || ""
  const avatarUrl =
    (user.user_metadata as { avatar_url?: string; picture?: string } | null)?.avatar_url ??
    (user.user_metadata as { avatar_url?: string; picture?: string } | null)?.picture ??
    null
  const showSysadmin = await isAdminish()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
        <div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
          <Link
            href="/app"
            className="flex items-baseline gap-2 tracking-tight text-ink"
          >
            <span className="font-semibold">Caixa Forte</span>
            <span className="hidden text-muted sm:inline">—</span>
            <span className="hidden font-serif text-sm italic text-muted sm:inline">
              É preto no branco!
            </span>
          </Link>
          <div className="hidden flex-1 justify-center md:flex">
            <AppNav showSysadmin={showSysadmin} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <ThemeToggle />
            <ProfileMenu shortName={shortName} avatarUrl={avatarUrl} />
          </div>
        </div>
        <div className="border-t border-border md:hidden">
          <AppNav showSysadmin={showSysadmin} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
      <LoginHeartbeat />
      <Footer />
    </div>
  )
}
