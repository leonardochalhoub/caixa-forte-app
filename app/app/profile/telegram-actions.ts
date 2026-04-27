"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

// 8-char token (A-Z, 0-9, no lookalikes) valid for 15 minutes. Single
// active token per user — generating a new one replaces the old so the
// list doesn't grow.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randomToken(length = 8): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export interface TelegramStatus {
  linked: boolean
  chatId: number | null
  token: string | null
  tokenExpiresAt: string | null
}

export async function getTelegramStatusAction(): Promise<TelegramStatus> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from("profiles")
    .select("telegram_chat_id")
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: token } = await admin
    .from("telegram_link_tokens")
    .select("token, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = Date.now()
  const expiresAt = token?.expires_at
  const stillValid =
    expiresAt && new Date(expiresAt).getTime() > now ? expiresAt : null

  return {
    linked: !!profile?.telegram_chat_id,
    chatId: profile?.telegram_chat_id ?? null,
    token: stillValid ? (token?.token ?? null) : null,
    tokenExpiresAt: stillValid ?? null,
  }
}

export async function generateTelegramTokenAction(): Promise<TelegramStatus> {
  const user = await requireUser()
  const admin = createAdminClient()

  // Clear any expired or superseded tokens for this user before inserting
  // a fresh one — keeps the table small and enforces one-active-at-a-time.
  await admin.from("telegram_link_tokens").delete().eq("user_id", user.id)

  // Retry a few times to dodge rare collisions on the PK.
  let token = ""
  let inserted = false
  for (let i = 0; i < 5 && !inserted; i++) {
    token = randomToken(8)
    const { error } = await admin.from("telegram_link_tokens").insert({
      token,
      user_id: user.id,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    if (!error) inserted = true
  }
  if (!inserted) throw new Error("Não consegui gerar um token único. Tente novamente.")

  revalidatePath("/app/profile")
  return getTelegramStatusAction()
}

export async function unlinkTelegramAction(): Promise<TelegramStatus> {
  const user = await requireUser()
  const admin = createAdminClient()

  await admin
    .from("profiles")
    .update({ telegram_chat_id: null })
    .eq("user_id", user.id)
  await admin.from("telegram_link_tokens").delete().eq("user_id", user.id)

  revalidatePath("/app/profile")
  return getTelegramStatusAction()
}
