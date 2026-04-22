"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "cfx-cookie-consent-v1"
type Decision = "accepted" | "essential-only"

interface Stored {
  decision: Decision
  decidedAt: string
}

/**
 * LGPD/GDPR-style cookie banner. Renders fixed at the bottom until the
 * user decides; decision persists in localStorage so the banner doesn't
 * reappear across sessions. Ported from amazing-school.
 */
export function CookieConsent() {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Stored
        setDecision(parsed.decision)
      }
    } catch {
      /* ignore */
    }
    setReady(true)
  }, [])

  function persist(d: Decision) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ decision: d, decidedAt: new Date().toISOString() }),
      )
    } catch {
      /* ignore */
    }
    setDecision(d)
  }

  if (!ready || decision) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 md:p-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-canvas/95 p-4 shadow-2xl backdrop-blur-md md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
          <div className="flex-1 text-sm">
            <p className="font-semibold text-strong">🍪 Cookies e sua privacidade</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Usamos cookies essenciais para manter você autenticado e
              salvar preferências (tema, último email). Não vendemos nem
              compartilhamos seus dados. Em conformidade com a LGPD (Lei
              13.709/18) e o GDPR — veja a{" "}
              <Link
                href="/docs"
                className="underline underline-offset-2 hover:text-strong"
              >
                documentação pública
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => persist("essential-only")}
              className="flex-1 md:flex-none"
            >
              Só essenciais
            </Button>
            <Button
              size="sm"
              onClick={() => persist("accepted")}
              className="flex-1 md:flex-none"
            >
              Aceitar tudo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
