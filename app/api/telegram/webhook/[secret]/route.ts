import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"
import { captureAudio, captureText } from "@/lib/capture/pipeline"
import {
  downloadFile,
  sendMessage,
  type TelegramUpdate,
} from "@/lib/telegram/api"
import { formatBRL } from "@/lib/money"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Telegram sends every update to the URL the bot was registered against.
 * The secret lives in the path so only Telegram (who knows the URL) can
 * reach this handler; missing or wrong secret → 404 and we bail fast.
 *
 * Flow per update:
 *   1. Validate secret.
 *   2. Resolve the chat_id → user_id via profiles.telegram_chat_id.
 *      If unknown, the first allowed command is `/start <token>` which
 *      consumes a freshly-generated token and binds the chat.
 *   3. Text → captureText; voice/audio → captureAudio.
 *   4. Reply with a compact pt-BR confirmation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return new NextResponse("not found", { status: 404 })
  }

  // Always respond 200 quickly so Telegram doesn't retry aggressively.
  // We do the heavy lifting after acknowledging internally.
  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })

  const chatId = msg.chat.id
  const admin = createAdminClient()
  const db = untyped(admin)

  // /start TOKEN — bind this chat to the user who issued the token.
  const text = (msg.text ?? "").trim()
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/)
    const token = (parts[1] ?? "").toUpperCase()
    if (!token) {
      await sendMessage({
        chatId,
        text:
          "Olá! Para vincular sua conta, gere um token em <b>Perfil</b> e reenvie <code>/start SEU_TOKEN</code>.",
      })
      return NextResponse.json({ ok: true })
    }

    const { data: row } = await db
      .from("telegram_link_tokens")
      .select("user_id, expires_at")
      .eq("token", token)
      .maybeSingle()

    if (!row) {
      await sendMessage({ chatId, text: "Token inválido." })
      return NextResponse.json({ ok: true })
    }
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      await sendMessage({
        chatId,
        text: "Token expirado. Gere um novo no Perfil e tente de novo.",
      })
      return NextResponse.json({ ok: true })
    }

    await db
      .from("profiles")
      .update({ telegram_chat_id: chatId })
      .eq("user_id", row.user_id as string)
    await db.from("telegram_link_tokens").delete().eq("token", token)

    await sendMessage({
      chatId,
      text:
        "✅ Conta vinculada! Me mande uma mensagem ou um áudio e registro a transação.\n\nEx: <i>gastei 25 no ifood ontem</i>",
    })
    return NextResponse.json({ ok: true })
  }

  // Resolve chat → user for everything else.
  const { data: linked } = await db
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()

  if (!linked) {
    await sendMessage({
      chatId,
      text:
        "Este chat ainda não está vinculado. Gere um token em <b>Perfil</b> no app e envie <code>/start SEU_TOKEN</code>.",
    })
    return NextResponse.json({ ok: true })
  }
  const userId = linked.user_id as string

  // Voice / audio → captureAudio
  const voiceFileId = msg.voice?.file_id ?? msg.audio?.file_id
  if (voiceFileId) {
    const blob = await downloadFile(voiceFileId)
    if (!blob) {
      await sendMessage({ chatId, text: "Não consegui baixar o áudio." })
      return NextResponse.json({ ok: true })
    }
    const result = await captureAudio({
      client: admin,
      userId,
      channel: "telegram_voice",
      blob,
    })
    await replyResult(chatId, result)
    return NextResponse.json({ ok: true })
  }

  // Text → captureText
  if (text) {
    const result = await captureText({
      client: admin,
      userId,
      channel: "telegram_text",
      rawInput: text,
    })
    await replyResult(chatId, result)
    return NextResponse.json({ ok: true })
  }

  await sendMessage({
    chatId,
    text: "Me manda um texto ou áudio descrevendo a transação.",
  })
  return NextResponse.json({ ok: true })
}

async function replyResult(
  chatId: number,
  r: Awaited<ReturnType<typeof captureText>>,
) {
  if (!r.ok || !r.parsed) {
    await sendMessage({
      chatId,
      text: `⚠️ ${r.error ?? "Não consegui interpretar."} Tente escrever de forma mais direta.`,
    })
    return
  }
  const p = r.parsed
  const sign = p.type === "income" ? "+" : "−"
  const cat = p.subcategoryName
    ? `${p.categoryName} · ${p.subcategoryName}`
    : p.categoryName
  const conf = Math.round(p.confidence * 100)
  const lines = [
    `✅ <b>${sign} ${formatBRL(p.amountCents)}</b>`,
    `<i>${cat}</i>`,
    p.merchant ? `📍 ${p.merchant}` : null,
    `📅 ${p.occurredOn}${conf < 70 ? ` · confiança ${conf}%` : ""}`,
  ].filter(Boolean)
  await sendMessage({ chatId, text: lines.join("\n") })
}
