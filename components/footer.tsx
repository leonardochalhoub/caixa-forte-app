import { Github, Linkedin } from "lucide-react"
import pkg from "../package.json"

// Versão lida automaticamente do package.json — bumpe a versão lá e
// aparece aqui sem outro lugar pra atualizar. Single source of truth.
export const APP_VERSION = pkg.version

// Label do estágio segundo o veredicto do Conselho v5:
// "Saiu do beta, entrou em validação inicial — agora é distribuição,
// não construção."
export const APP_VERSION_LABEL = "validação inicial"

// ISO 8601 com timezone explícito — atualizar no momento de cada release.
// Usamos -03:00 (BRT, America/Sao_Paulo) pra alinhar com fuso do app
// e do user. <time dateTime=...> pega esta string crua;
// formatRelease() converte pra display dd/MM/yyyy HH:mm.
export const APP_RELEASE_AT = "2026-04-27T16:36:00-03:00"

const AUTHOR_NAME = process.env.NEXT_PUBLIC_AUTHOR_NAME ?? "Leonardo Chalhoub"
const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/leonardochalhoub"
const LINKEDIN_URL =
  process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "https://www.linkedin.com/in/leonardochalhoub"

function formatRelease(iso: string): string {
  // dd/MM/yyyy HH:mm em São Paulo timezone — natural pra brasileiro.
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return iso.slice(0, 10)
  }
}

export function Footer() {
  const releaseDisplay = formatRelease(APP_RELEASE_AT)

  return (
    <footer className="no-print border-t border-border bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-4 text-xs text-muted sm:flex-row">
        <div className="flex items-center gap-3">
          <span>
            Feito por{" "}
            <span className="text-strong">{AUTHOR_NAME}</span>
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="transition-colors hover:text-strong"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="transition-colors hover:text-strong"
          >
            <Linkedin className="h-4 w-4" />
          </a>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span>
            v{APP_VERSION} ·{" "}
            <span className="text-strong">{APP_VERSION_LABEL}</span>
          </span>
          <span aria-hidden>·</span>
          <time dateTime={APP_RELEASE_AT} title={`Release: ${APP_RELEASE_AT}`}>
            {releaseDisplay}
          </time>
        </div>
      </div>
    </footer>
  )
}
