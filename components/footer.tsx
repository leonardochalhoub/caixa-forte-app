import { Github, Linkedin } from "lucide-react"

export const APP_VERSION = "0.0.1"
export const APP_VERSION_LABEL = "prototype"
export const APP_VERSION_DATE = "2026-04-22"

const AUTHOR_NAME = process.env.NEXT_PUBLIC_AUTHOR_NAME ?? "Leonardo Chalhoub"
const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/leonardochalhoub"
const LINKEDIN_URL =
  process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "https://www.linkedin.com/in/leonardochalhoub"

export function Footer() {
  return (
    <footer className="border-t border-border bg-canvas">
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
            v{APP_VERSION} · {APP_VERSION_LABEL}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={APP_VERSION_DATE}>{APP_VERSION_DATE}</time>
        </div>
      </div>
    </footer>
  )
}
