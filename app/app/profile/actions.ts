"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const UpdateDisplayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
})

export async function updateDisplayName(input: z.infer<typeof UpdateDisplayNameSchema>) {
  const user = await requireUser()
  const parsed = UpdateDisplayNameSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.displayName })
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/app/profile")
  revalidatePath("/app")
}

const AVATAR_BUCKET = "avatars"
const MAX_AVATAR_BYTES = 500 * 1024

async function ensureAvatarBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: bucket } = await admin.storage.getBucket(AVATAR_BUCKET)
  if (bucket) return
  const { error } = await admin.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: MAX_AVATAR_BYTES,
    allowedMimeTypes: ["image/webp", "image/png", "image/jpeg"],
  })
  if (error && !String(error.message).toLowerCase().includes("already exists")) {
    throw new Error(`Falha ao preparar bucket de avatares: ${error.message}`)
  }
}

export async function uploadAvatarAction(formData: FormData): Promise<{ url: string }> {
  const user = await requireUser()
  const file = formData.get("avatar")
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.")
  if (file.size === 0) throw new Error("Arquivo vazio.")
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Imagem muito grande (máx. 500KB depois de comprimida).")
  }

  const admin = createAdminClient()
  await ensureAvatarBucket(admin)

  const path = `${user.id}.webp`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "0",
    })
  if (upErr) throw new Error(`Erro ao enviar foto: ${upErr.message}`)

  const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const versionedUrl = `${publicData.publicUrl}?v=${Date.now()}`

  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), avatar_url: versionedUrl },
  })
  if (metaErr) throw new Error(`Erro ao atualizar perfil: ${metaErr.message}`)

  revalidatePath("/app/profile")
  revalidatePath("/app")
  return { url: versionedUrl }
}

export async function removeAvatarAction(): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()

  await admin.storage.from(AVATAR_BUCKET).remove([`${user.id}.webp`])

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), avatar_url: null },
  })
  if (error) throw new Error(error.message)

  revalidatePath("/app/profile")
  revalidatePath("/app")
}
