import { cookies } from "next/headers"
import { NextResponse } from "next/server"

// Limpa cookies Supabase e redireciona pra home. Origin é derivado do
// próprio request pra funcionar em qualquer ambiente (local, preview,
// prod) sem depender de NEXT_PUBLIC_SITE_URL.
async function clear(req: Request) {
  const origin = new URL(req.url).origin
  const store = await cookies()
  const response = NextResponse.redirect(new URL("/", origin), { status: 303 })
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.startsWith("__supabase")) {
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      })
    }
  }
  return response
}

export async function GET(req: Request) {
  return clear(req)
}

export async function POST(req: Request) {
  return clear(req)
}
