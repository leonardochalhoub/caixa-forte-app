"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { CityPicker, type SelectedCity } from "@/components/CityPicker"
import { translateAuthError } from "@/lib/auth-errors"
import { createBrowserClient } from "@/lib/supabase/browser"
import { saveProfileGenderAction, saveProfileLocationAction } from "../actions"

export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [city, setCity] = useState<SelectedCity | null>(null)
  const [gender, setGender] = useState<"M" | "F" | "">("")
  const [sent, setSent] = useState(false)
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
    if (!city) {
      toast.error("Informe sua cidade.")
      return
    }
    if (!gender) {
      toast.error("Selecione o gênero.")
      return
    }
    start(async () => {
      const supabase = createBrowserClient()
      // Prefer the origin the user is actually on so confirmation emails
      // link back to wherever they signed up (Vercel prod vs. preview vs.
      // local). Fall back to NEXT_PUBLIC_SITE_URL only if the origin is
      // somehow unavailable — avoids baking a stale env var into a
      // cross-device email link that Safari then can't reach.
      const origin =
        typeof window !== "undefined" && window.location.origin
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_SITE_URL ?? "")
      // Stash the picked city + gender inside user_metadata so the first
      // authenticated pageload (on ANY device, after email confirmation)
      // can sync them into profiles. Avoids the cross-device data loss
      // that happened when we only kept them in localStorage.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            pending_city_ibge: city.ibge_id,
            pending_city_name: city.name,
            pending_uf: city.uf,
            pending_gender: gender,
          },
        },
      })
      if (error) {
        toast.error("Não foi possível criar a conta.", {
          description: translateAuthError(error.message),
        })
        return
      }
      if (data.session) {
        await saveProfileLocationAction({
          ibgeId: city.ibge_id,
          cityName: city.name,
          uf: city.uf,
        }).catch(() => {})
        await saveProfileGenderAction({ gender }).catch(() => {})
        toast.success("Conta criada!")
        router.push("/onboarding")
        router.refresh()
      } else {
        // Remember the picked city for later: when the user clicks the email
        // confirmation link, /auth/callback can read it and persist.
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "cfx:pending-city",
            JSON.stringify(city),
          )
        }
        setSent(true)
      }
    })
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-subtle p-4 text-sm text-body">
        Enviamos um email de confirmação para <strong className="text-strong">{email}</strong>.
        Clica no link para ativar sua conta e depois volta aqui para entrar.
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
      <div className="space-y-2">
        <Label htmlFor="city">Cidade</Label>
        <CityPicker id="city" value={city} onChange={setCity} required />
      </div>
      <div className="space-y-2">
        <Label>Gênero</Label>
        <div className="grid grid-cols-2 gap-2">
          <GenderOption
            value="M"
            selected={gender === "M"}
            onSelect={() => setGender("M")}
            label="Masculino"
          />
          <GenderOption
            value="F"
            selected={gender === "F"}
            onSelect={() => setGender("F")}
            label="Feminino"
          />
        </div>
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
        {pending ? "Criando..." : "Criar conta"}
      </Button>
    </form>
  )
}

function GenderOption({
  selected,
  onSelect,
  label,
}: {
  value: "M" | "F"
  selected: boolean
  onSelect: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-strong bg-subtle text-strong"
          : "border-border text-body hover:border-muted"
      }`}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}
