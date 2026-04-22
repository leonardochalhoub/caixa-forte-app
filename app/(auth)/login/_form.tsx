"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { translateAuthError } from "@/lib/auth-errors"
import { createBrowserClient } from "@/lib/supabase/browser"
import { recordLoginAction } from "../actions"

const EMAIL_STORAGE_KEY = "cfx:last-email"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, start] = useTransition()

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(EMAIL_STORAGE_KEY)
    if (saved) setEmail(saved)
  }, [])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    start(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        toast.error("Não foi possível entrar.", { description: translateAuthError(error.message) })
        return
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(EMAIL_STORAGE_KEY, email)
      }
      // Telemetry is best-effort — never let it block the navigation.
      void recordLoginAction().catch(() => {})
      toast.success("Bem-vindo de volta!")
      // Hard reload instead of router.push so the server-rendered /app
      // route sees the freshly-set session cookie. Soft navigation can
      // race the cookie and bounce the user back to /login.
      if (typeof window !== "undefined") {
        window.location.assign("/app")
      } else {
        router.push("/app")
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        <Link
          href="/esqueci-senha"
          className="block text-right text-xs text-muted underline-offset-4 hover:text-strong hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  )
}
