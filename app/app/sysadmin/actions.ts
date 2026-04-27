"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { isOwner, requireAdmin, requireOwner } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

const SetRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
})

export async function setRoleAction(input: z.infer<typeof SetRoleSchema>) {
  await requireOwner()
  const parsed = SetRoleSchema.parse(input)
  const admin = createAdminClient()

  // Prevent demoting the owner accidentally.
  const target = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", parsed.userId)
    .maybeSingle()
  if (target?.data?.role === "owner") {
    throw new Error("Não é possível rebaixar o owner.")
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: parsed.role })
    .eq("user_id", parsed.userId)
  if (error) throw new Error(error.message)
  revalidatePath("/app/sysadmin")
}

export async function refreshSysadminStats() {
  await requireAdmin()
  revalidatePath("/app/sysadmin")
}

export async function currentUserIsOwner(): Promise<boolean> {
  return await isOwner()
}
