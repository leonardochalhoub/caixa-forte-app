"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { translateAuthError } from "@/lib/auth-errors"
import { createBrowserClient } from "@/lib/supabase/browser"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    start(async () => {
      const supabase = createBrowserClient()
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/redefinir-senha`,
      })
      if (error) {
        toast.error("Não foi possível enviar.", {
          description: translateAuthError(error.message),
        })
        return
      }
      setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-subtle p-4 text-sm text-body">
        Enviamos um link para <strong className="text-strong">{email}</strong>. Clica nele no seu
        email para definir uma nova senha.
      </div>
    )
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
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link de recuperação"}
      </Button>
    </form>
  )
}
