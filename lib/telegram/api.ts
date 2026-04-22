// Thin Telegram Bot API client. Uses only global fetch; no external SDK.
// All callers must provide TELEGRAM_BOT_TOKEN via env and be running
// server-side (the token is a secret).

const BASE = "https://api.telegram.org"

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN missing")
  return t
}

interface SendMessageOpts {
  chatId: number
  text: string
  parseMode?: "HTML" | "MarkdownV2"
  disablePreview?: boolean
  replyToMessageId?: number
}

/**
 * Fire a sendMessage request. Ignores failures silently so a dead bot
 * never crashes the capture pipeline — the transaction itself already
 * saved.
 */
export async function sendMessage(opts: SendMessageOpts): Promise<void> {
  try {
    await fetch(`${BASE}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: opts.parseMode ?? "HTML",
        disable_web_page_preview: opts.disablePreview ?? true,
        reply_to_message_id: opts.replyToMessageId,
      }),
    })
  } catch {
    /* swallow */
  }
}

interface TelegramFileInfo {
  file_path?: string
  file_size?: number
}

/**
 * Resolve a Telegram file_id → path (max 20MB for the Bot API). Returns
 * null when the lookup fails.
 */
async function getFilePath(fileId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${BASE}/bot${token()}/getFile?file_id=${encodeURIComponent(fileId)}`,
    )
    if (!r.ok) return null
    const j = (await r.json()) as { ok: boolean; result?: TelegramFileInfo }
    return j.ok && j.result?.file_path ? j.result.file_path : null
  } catch {
    return null
  }
}

/**
 * Downloads a Telegram voice/audio file as a Blob. Caller decides what to
 * do with it — typically hand it to `captureAudio()`.
 */
export async function downloadFile(fileId: string): Promise<Blob | null> {
  const path = await getFilePath(fileId)
  if (!path) return null
  try {
    const r = await fetch(`${BASE}/file/bot${token()}/${path}`)
    if (!r.ok) return null
    return await r.blob()
  } catch {
    return null
  }
}

/**
 * Shape of the webhook POST body we care about. Trimmed to fields we
 * actually read to keep the parser focused.
 */
export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string; username?: string }
    from?: { id: number; username?: string; first_name?: string }
    date: number
    text?: string
    voice?: { file_id: string; duration: number; mime_type?: string }
    audio?: { file_id: string; duration: number }
  }
}
