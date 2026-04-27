import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 10

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "larissa.demo@caixa-forte.app"
const DEMO_PASSWORD = process.env.DEMO_PASSWORD

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url)
    const origin = urlObj.origin

    // Log do click (service role pra bypassar RLS na escrita).
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (adminUrl && svcKey) {
      const admin = createClient(adminUrl, svcKey, {
        auth: { persistSession: false },
      })
      const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null
      const referrer = req.headers.get("referer")?.slice(0, 240) ?? null
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        ""
      // Hash leve — IP bruto é PII; hash trunc já permite contar únicos
      const ipHash = ip
        ? Buffer.from(ip).toString("base64").slice(0, 24)
        : null
      await admin
        .from("demo_clicks")
        .insert({ user_agent: ua, referrer, ip_hash: ipHash })
    }

    if (!DEMO_PASSWORD) {
      return NextResponse.redirect(
        `${origin}/?demo_error=${encodeURIComponent("DEMO_PASSWORD não configurada no servidor")}`,
        { status: 303 },
      )
    }

    // Sign-in como Larissa: cria os cookies de auth dela nesse browser.
    // Quando o usuário for em /login e logar com a própria senha, os
    // cookies são sobrescritos — volta pra conta dele.
    const supabase = await createServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })
    if (error) {
      return NextResponse.redirect(
        `${origin}/?demo_error=${encodeURIComponent(error.message)}`,
        { status: 303 },
      )
    }

    return NextResponse.redirect(`${origin}/app`, { status: 303 })
  } catch (err) {
    const origin = new URL(req.url).origin
    const msg = err instanceof Error ? err.message : "erro"
    return NextResponse.redirect(
      `${origin}/?demo_error=${encodeURIComponent(msg)}`,
      { status: 303 },
    )
  }
}
