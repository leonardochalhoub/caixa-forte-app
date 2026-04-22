import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { logLoginEvent } from "@/lib/login-events"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  if (code) {
    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data?.user) {
        await logLoginEvent(data.user.id, request).catch(() => {})
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
