import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Debug-only helper. Returns getMe + getWebhookInfo from Telegram and the
 * effective registration URL computed from the request host, so you can
 * verify in one page whether the webhook is registered and pointed at the
 * right endpoint. Secret-gated just like the real webhook.
 *
 * GET /api/telegram/debug/<secret>           -> status JSON
 * GET /api/telegram/debug/<secret>?register  -> also calls setWebhook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!expected || secret !== expected) {
    return new NextResponse("not found", { status: 404 })
  }
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not set on this deployment" },
      { status: 500 },
    )
  }

  const origin =
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  const targetWebhook = `${origin}/api/telegram/webhook/${encodeURIComponent(
    secret,
  )}`

  const shouldRegister = request.nextUrl.searchParams.has("register")

  const out: Record<string, unknown> = {
    effective_origin: origin,
    target_webhook: targetWebhook,
    registered: shouldRegister,
  }

  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    out.getMe = await me.json()
  } catch (err) {
    out.getMe_error = (err as Error).message
  }

  if (shouldRegister) {
    try {
      const reg = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: targetWebhook,
            allowed_updates: ["message"],
            drop_pending_updates: true,
          }),
        },
      )
      out.setWebhook = await reg.json()
    } catch (err) {
      out.setWebhook_error = (err as Error).message
    }
  }

  try {
    const info = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    )
    out.getWebhookInfo = await info.json()
  } catch (err) {
    out.getWebhookInfo_error = (err as Error).message
  }

  return NextResponse.json(out, {
    headers: { "cache-control": "no-store" },
  })
}
