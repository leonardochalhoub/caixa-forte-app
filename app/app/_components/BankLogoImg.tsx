"use client"

import { useState } from "react"
import { bankLogoCandidates } from "@/lib/bank-logos"

/**
 * Walks the candidate-domain chain returned by `bankLogoCandidates` so that
 * a new/unknown bank still has a shot at surfacing a real logo before the
 * visual fallback kicks in. When every candidate fails, renders a neutral
 * placeholder at the same footprint so layout doesn't shift.
 */
export function BankLogoImg({
  name,
  className = "h-4 w-4 shrink-0 rounded-sm object-contain",
  fallback,
}: {
  name: string
  className?: string
  fallback?: React.ReactNode
}) {
  const candidates = bankLogoCandidates(name)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const url = !failed ? candidates[index] : undefined

  if (!url) {
    return fallback ?? <span className={className} aria-hidden />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      className={className}
      loading="lazy"
      onError={() => {
        if (index + 1 < candidates.length) setIndex(index + 1)
        else setFailed(true)
      }}
    />
  )
}
