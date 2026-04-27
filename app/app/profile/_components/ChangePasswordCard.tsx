"use client"

import { useState } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { createBrowserClient } from "@/lib/supabase/browser"

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [visible, setVisible] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (next.length < 8) {
      toast.error("A nova senha precisa ter pelo menos 8 caracteres.")
      return
    }
    if (next !== confirm) {
      toast.error("A confirmação não bate com a nova senha.")
      return
    }
    setPending(true)
    try {
      const supabase = createBrowserClient()
      const { data: u } = await supabase.auth.getUser()
      const emailAddr = u.user?.email
      if (!emailAddr) throw new Error("Sessão não encontrada.")

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: emailAddr,
        password: current,
      })
      if (signInErr) {
        toast.error("Senha atual incorreta.")
        return
      }

      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw error

      toast.success("Senha atualizada.")
      setCurrent("")
      setNext("")
      setConfirm("")
      setVisible(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setPending(false)
    }
  }

  if (!visible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>Mantenha sua conta protegida.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setVisible(true)} className="gap-2">
            <KeyRound className="h-4 w-4" />
            Trocar senha
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
        <CardDescription>Pedimos a senha atual pra confirmar que é você.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="current-pwd">Senha atual</Label>
            <Input
              id="current-pwd"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next-pwd">Nova senha</Label>
            <Input
              id="next-pwd"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirmar nova senha</Label>
            <Input
              id="confirm-pwd"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Atualizando..." : "Confirmar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVisible(false)
                setCurrent("")
                setNext("")
                setConfirm("")
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
