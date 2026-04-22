"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { translateAuthError } from "@/lib/auth-errors"
import { createBrowserClient } from "@/lib/supabase/browser"

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) {
      toast.error("As senhas não coincidem.")
      return
    }
    if (password.length < 8) {
      toast.error("Senha muito curta.", { description: "Use pelo menos 8 caracteres." })
      return
    }
    start(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        toast.error("Não foi possível salvar.", {
          description: translateAuthError(error.message),
        })
        return
      }
      toast.success("Senha atualizada.")
      router.push("/app")
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="Pelo menos 8 caracteres"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input
          id="confirm"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  )
}
