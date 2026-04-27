"use client"

import { useState } from "react"
import { Landmark } from "lucide-react"
import { bankLogoCandidates } from "@/lib/bank-logos"

export function BankLogo({ name }: { name: string }) {
  const candidates = bankLogoCandidates(name)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const url = !failed && candidates[index] ? candidates[index] : null

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-subtle text-strong">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={`Logo ${name}`}
          className="h-6 w-6 object-contain"
          loading="lazy"
          onError={() => {
            if (index + 1 < candidates.length) setIndex(index + 1)
            else setFailed(true)
          }}
        />
      ) : (
        <Landmark className="h-4 w-4" aria-hidden />
      )}
    </span>
  )
}
