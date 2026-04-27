"use server"

import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { transcribeAudio } from "@/lib/parser/parse-transaction"

export async function transcribeAudioOnlyAction(
  formData: FormData,
): Promise<{ ok: boolean; text?: string; error?: string; durationMs?: number }> {
  const user = await requireUser()
  const file = formData.get("audio")
  if (!file || typeof file === "string") {
    return { ok: false, error: "Áudio ausente no upload." }
  }
  const blob = file as Blob
  if (blob.size === 0) return { ok: false, error: "Áudio vazio." }
  if (blob.size > 25 * 1024 * 1024) return { ok: false, error: "Áudio muito grande (máx 25MB)." }

  try {
    const { text, durationMs, model } = await transcribeAudio(blob)
    const supabase = await createServerClient()
    await supabase.from("capture_messages").insert({
      user_id: user.id,
      channel: "web_voice",
      raw_input: text,
      transcription: text,
      duration_ms: durationMs,
      model,
      error: "transcribed_pending_review",
      metadata: null,
    })
    return { ok: true, text, durationMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Whisper falhou"
    return { ok: false, error: message }
  }
}
