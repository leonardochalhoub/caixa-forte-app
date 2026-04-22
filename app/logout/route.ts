import { cookies } from "next/headers"
import { NextResponse } from "next/server"

// Hard-clear Supabase auth cookies and redirect home. Useful recovery when
// the session JWT is oversized or corrupt and normal pages can't load.
async function clear() {
  const store = await cookies()
  const response = NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  )
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

export async function GET() {
  return clear()
}

export async function POST() {
  return clear()
}
