"use client"

import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackDocClickAction } from "@/app/(marketing)/docs/actions"

interface Props {
  source: "main" | "profile"
  /**
   * `button` = full-size outlined button (used on landing).
   * `pill`   = compact uppercase pill that matches PrivacyDisclaimer
   *            so the two sit side-by-side without clashing.
   */
  shape?: "button" | "pill"
  size?: "default" | "sm" | "lg" | "icon"
  label?: string
  className?: string
}

/**
 * Navigates to /docs while firing a best-effort click event into the
 * analytics table. Anonymous clicks on the landing page are recorded with
 * user_id NULL; logged-in Perfil clicks tag the user id.
 */
export function DocsButton({
  source,
  shape = "button",
  size = "default",
  label = "Documentação",
  className,
}: Props) {
  const trackAndGo = () => {
    void trackDocClickAction({ source })
  }

  if (shape === "pill") {
    return (
      <Link
        href="/docs"
        prefetch
        onClick={trackAndGo}
        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-subtle px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-body transition-colors hover:border-muted hover:text-strong ${className ?? ""}`}
      >
        <BookOpen className="h-3 w-3" />
        {label}
      </Link>
    )
  }

  return (
    <Button asChild variant="outline" size={size} className={className}>
      <Link href="/docs" prefetch onClick={trackAndGo}>
        <BookOpen className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  )
}
