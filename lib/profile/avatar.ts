const MAX_AVATAR_PX = 256
const WEBP_QUALITY = 0.85

export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "•"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "•"
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export async function fileToWebpBlob(file: File): Promise<Blob> {
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
