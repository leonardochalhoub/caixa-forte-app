"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { CityPicker, type SelectedCity } from "@/components/CityPicker"
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
import { ReadField } from "./ReadField"
import { fileToWebpBlob, initialsFrom } from "@/lib/profile/avatar"
import { formatBirthdayBR } from "@/lib/profile/format"

export function IdentitySection({
  email,
  displayName: initialName,
  avatarUrl: initialAvatar,
  initialCity,
  initialGender,
  initialBirthday,
}: {
  email: string
  displayName: string
  avatarUrl: string | null
  initialCity: SelectedCity | null
  initialGender: "M" | "F" | null
  initialBirthday: string | null
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
  )
}
