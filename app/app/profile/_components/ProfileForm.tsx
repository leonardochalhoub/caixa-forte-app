"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Camera, KeyRound, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { createBrowserClient } from "@/lib/supabase/browser"
import { CityPicker, type SelectedCity } from "@/components/CityPicker"
import { DocsButton } from "@/components/DocsButton"
import { PrivacyDisclaimer } from "@/components/PrivacyDisclaimer"
import { TelegramCard } from "./TelegramCard"
import {
  saveProfileBirthdayAction,
  saveProfileGenderAction,
  saveProfileLocationAction,
} from "@/app/(auth)/actions"
import {
  removeAvatarAction,
  updateDisplayName,
  uploadAvatarAction,
} from "../actions"
import { deleteAccountAction, type LifecycleEvent } from "../lifecycle"

const MAX_AVATAR_PX = 256
const WEBP_QUALITY = 0.85

function initialsFrom(name: string | null | undefined): string {
  if (!name) return "•"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "•"
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

async function fileToWebpBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("Imagem inválida."))
    el.src = dataUrl
  })
  const scale = Math.min(1, MAX_AVATAR_PX / Math.max(img.width, img.height))
  const outW = Math.round(img.width * scale)
  const outH = Math.round(img.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Sem suporte a canvas.")
  ctx.drawImage(img, 0, 0, outW, outH)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  )
  if (!blob) throw new Error("Falha ao converter para WebP.")
  return blob
}

function formatBirthdayBR(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function ProfileForm({
  email,
  displayName: initialName,
  telegramLinked,
  avatarUrl: initialAvatar,
  initialCity,
  initialGender,
  initialBirthday,
  lifecycleEvents,
}: {
  email: string
  displayName: string
  telegramLinked: boolean
  avatarUrl: string | null
  initialCity: SelectedCity | null
  initialGender: "M" | "F" | null
  initialBirthday: string | null
  lifecycleEvents: LifecycleEvent[]
}) {
  const router = useRouter()

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(initialName)
  const [city, setCity] = useState<SelectedCity | null>(initialCity)
  const [gender, setGender] = useState<"M" | "F" | "">(initialGender ?? "")
  const [birthday, setBirthday] = useState<string>(initialBirthday ?? "")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar)
  const [uploading, setUploading] = useState(false)
  const [pending, start] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function cancelEdits() {
    setDisplayName(initialName)
    setCity(initialCity)
    setGender(initialGender ?? "")
    setBirthday(initialBirthday ?? "")
    setEditing(false)
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    start(async () => {
      try {
        if (displayName.trim() !== initialName) {
          await updateDisplayName({ displayName: displayName.trim() })
        }
        if (
          city &&
          (city.ibge_id !== initialCity?.ibge_id || city.name !== initialCity?.name)
        ) {
          await saveProfileLocationAction({
            ibgeId: city.ibge_id,
            cityName: city.name,
            uf: city.uf,
          })
        }
        if (gender && gender !== (initialGender ?? "")) {
          await saveProfileGenderAction({ gender })
        }
        if (birthday && birthday !== (initialBirthday ?? "")) {
          await saveProfileBirthdayAction({ birthday })
        }
        toast.success("Perfil atualizado.")
        setEditing(false)
        router.refresh()
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem.")
      return
    }
    setUploading(true)
    try {
      const blob = await fileToWebpBlob(file)
      const fd = new FormData()
      fd.append("avatar", blob, "avatar.webp")
      const { url } = await uploadAvatarAction(fd)
      setAvatarUrl(url)
      toast.success("Foto atualizada.")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true)
    try {
      await removeAvatarAction()
      setAvatarUrl(null)
      toast.success("Foto removida.")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>Informações pessoais</CardTitle>
            <CardDescription>{email}</CardDescription>
          </div>
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </CardHeader>

        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-strong text-xl font-semibold text-canvas">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Foto do perfil"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initialsFrom(displayName || email)
                )}
              </span>
              {editing && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-canvas text-strong shadow-sm transition-colors hover:bg-subtle disabled:opacity-60"
                  title="Enviar foto"
                  aria-label="Enviar foto"
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-strong">Foto do perfil</p>
              {editing ? (
                <>
                  <p className="text-xs text-muted">
                    JPG, PNG ou HEIC — convertemos pra WebP automaticamente.
                  </p>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={uploading}
                      className="text-xs text-muted underline-offset-2 hover:text-strong hover:underline disabled:opacity-60"
                    >
                      Remover foto
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted">
                  Clique em Editar pra trocar sua foto.
                </p>
              )}
            </div>
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-city">Cidade</Label>
                <CityPicker id="profile-city" value={city} onChange={setCity} required />
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGender("M")}
                    aria-pressed={gender === "M"}
                    className={`flex items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors ${
                      gender === "M"
                        ? "border-strong bg-subtle text-strong"
                        : "border-border text-body hover:border-muted"
                    }`}
                  >
                    Masculino
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("F")}
                    aria-pressed={gender === "F"}
                    className={`flex items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors ${
                      gender === "F"
                        ? "border-strong bg-subtle text-strong"
                        : "border-border text-body hover:border-muted"
                    }`}
                  >
                    Feminino
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthday">Data de nascimento</Label>
                <Input
                  id="birthday"
                  type="date"
                  value={birthday}
                  onChange={(event) => setBirthday(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending || !displayName.trim()}>
                  {pending ? "Salvando..." : "Salvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdits}
                  disabled={pending}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <ReadField label="Nome" value={displayName || "—"} />
              <ReadField
                label="Cidade"
                value={city ? `${city.name} · ${city.uf}` : "não informada"}
                muted={!city}
              />
              <ReadField
                label="Gênero"
                value={
                  gender === "M"
                    ? "Masculino"
                    : gender === "F"
                      ? "Feminino"
                      : "não informado"
                }
                muted={!gender}
              />
              <ReadField
                label="Data de nascimento"
                value={formatBirthdayBR(birthday || null)}
                muted={!birthday}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <ChangePasswordCard />

      <TelegramCard />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <DocsButton source="profile" shape="pill" />
        <PrivacyDisclaimer />
      </div>

      <DangerZone events={lifecycleEvents} />
    </div>
  )
}

function DangerZone({ events }: { events: LifecycleEvent[] }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function handleDelete() {
    start(async () => {
      try {
        await deleteAccountAction()
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <Card className="border-expense/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-expense">
          <AlertTriangle className="h-4 w-4" />
          Zona de perigo
        </CardTitle>
        <CardDescription>
          Desativar sua conta bloqueia o acesso imediatamente. Seus dados
          continuam guardados — se você voltar e entrar com o mesmo email e
          senha, a conta é reativada automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="destructive"
          onClick={() => setOpen(true)}
          className="gap-2"
          disabled={pending}
        >
          <Trash2 className="h-4 w-4" />
          Desativar minha conta
        </Button>

        {events.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
              Histórico
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {events.map((e) => {
                const Icon = e.event_type === "deleted" ? Trash2 : RotateCcw
                const color =
                  e.event_type === "deleted" ? "text-expense" : "text-income"
                const label =
                  e.event_type === "deleted" ? "Desativada" : "Reativada"
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className={`flex items-center gap-2 ${color}`}>
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                    <span className="font-mono tabular-nums text-muted">
                      {formatIsoPtBr(e.happened_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desativar conta</DialogTitle>
              <DialogDescription>
                Você perde o acesso agora. Seus dados (transações, contas,
                categorias, fotos) permanecem guardados. Se entrar de novo
                com o mesmo email e senha, a conta reativa sozinha.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={pending}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {pending ? "Desativando..." : "Confirmar desativação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function formatIsoPtBr(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function ReadField({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className={muted ? "text-muted" : "font-medium text-strong"}>{value}</dd>
    </div>
  )
}

function ChangePasswordCard() {
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
