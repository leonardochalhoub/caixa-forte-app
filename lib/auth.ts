import { redirect } from "next/navigation"
import { createServerClient } from "./supabase/server"

export type Role = "user" | "admin" | "owner"

// Bootstrap fallback: until migration 0017 runs and profiles.role exists,
// the email configured here is treated as owner. Once the column lands,
// the DB value wins. Configure via BOOTSTRAP_OWNER_EMAIL or defaults to
// the project founder's email.
const BOOTSTRAP_OWNER_EMAIL = (
  process.env.BOOTSTRAP_OWNER_EMAIL ?? "leochalhoub@hotmail.com"
).toLowerCase()

export async function getUser() {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export async function requireUser() {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}

export async function requireOnboardedUser() {
  const user = await requireUser()
  const supabase = await createServerClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.onboarded_at) redirect("/onboarding")
  return user
}

export async function getRole(userId: string, email?: string | null): Promise<Role> {
  const supabase = await createServerClient()
  try {
    const res = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()
    const role = res?.data?.role
    if (role === "owner" || role === "admin" || role === "user") return role
  } catch {
    // Tabela/coluna ausente: cai pro bootstrap email-based.
  }
  if (email && email.toLowerCase() === BOOTSTRAP_OWNER_EMAIL) return "owner"
  return "user"
}

export async function isAdminish(): Promise<boolean> {
  const user = await getUser()
  if (!user) return false
  const role = await getRole(user.id, user.email)
  return role === "admin" || role === "owner"
}

export async function isOwner(): Promise<boolean> {
  const user = await getUser()
  if (!user) return false
  const role = await getRole(user.id, user.email)
  return role === "owner"
}

export async function requireAdmin() {
  const user = await requireUser()
  if (!(await isAdminish())) redirect("/app")
  return user
}

export async function requireOwner() {
  const user = await requireUser()
  if (!(await isOwner())) redirect("/app")
  return user
}
