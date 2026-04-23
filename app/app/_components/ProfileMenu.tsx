"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ChevronDown, LogOut, User } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/browser"

function initialsFrom(name: string | null | undefined): string {
  if (!name) return "•"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "•"
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function ProfileMenu({
  shortName,
  avatarUrl,
}: {
  shortName: string
  avatarUrl: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function handleLogout() {
    setOpen(false)
    start(async () => {
      // Cliente limpa localStorage; em seguida redireciona pro route /logout
      // que limpa os cookies httpOnly no servidor. Hard navigation garante
      // que próxima leitura já veja estado limpo (sem cache RSC).
      try {
        await createBrowserClient().auth.signOut()
      } catch {
        // Mesmo se der erro, avança pro server logout — prioridade é limpar cookies.
      }
      window.location.href = "/logout"
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-canvas py-1 pl-1 pr-2 text-sm transition-colors hover:border-muted hover:bg-subtle sm:pr-3"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-strong text-[11px] font-semibold text-canvas">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFrom(shortName)
          )}
        </span>
        <span className="hidden max-w-[140px] truncate text-strong sm:block">
          {shortName}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-canvas shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-strong">{shortName}</p>
          </div>
          <Link
            href="/app/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-body transition-colors hover:bg-subtle hover:text-strong"
          >
            <User className="h-4 w-4" />
            Perfil
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={pending}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-subtle hover:text-strong disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "Saindo..." : "Sair"}
          </button>
        </div>
      )}
    </div>
  )
}
