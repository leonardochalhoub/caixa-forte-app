import { NextResponse } from "next/server"
import { getUser, isAdminish } from "@/lib/auth"
import { seedDemoUser } from "@/lib/admin/seed-demo"
import type { RangeKey, SeedLog } from "@/lib/admin/seed-demo"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  const logs: SeedLog[] = []
  const note = (step: string, detail: string, ok = true) =>
    logs.push({ step, detail, ok })

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      )
    }
    const isAdmin = await isAdminish()
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Apenas admin/owner pode re-semear." },
        { status: 403 },
      )
    }
    const body = (await req.json().catch(() => ({}))) as { range?: RangeKey }
    const range: RangeKey = body.range ?? "full"

    try {
      const result = await seedDemoUser(range)
      return NextResponse.json({
        ok: true,
        userId: result.userId,
        city: result.city,
        logs: result.logs,
      })
    } catch (err) {
      // Env var ausente vira 503 pra preservar contrato anterior.
      if (
        err instanceof Error &&
        err.message === "Variáveis de ambiente ausentes."
      ) {
        return NextResponse.json(
          { ok: false, error: err.message },
          { status: 503 },
        )
      }
      throw err
    }
  } catch (err) {
    note("fatal", err instanceof Error ? err.message : String(err), false)
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error && err.message ? err.message : "Erro inesperado.",
        logs,
      },
      { status: 500 },
    )
  }
}
