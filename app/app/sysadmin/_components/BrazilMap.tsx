"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { locateCity } from "@/lib/data/brazil-city-coords"
import type { LeafletMarker } from "./BrazilLeafletMap"

export interface UserPin {
  user_id: string
  display_name: string | null
  email: string | null
  city_name: string | null
  uf: string
  lat: number | null
  lng: number | null
  gender: "M" | "F" | null
  created_at: string
}

// Ported from amazing-school — disjoint male/female palettes with a
// deterministic hash so the same person always gets the same color.
const MALE_COLORS = [
  "#1d4ed8",
  "#0e7490",
  "#0284c7",
  "#4338ca",
  "#0891b2",
  "#1e40af",
  "#14b8a6",
  "#155e75",
  "#2563eb",
  "#0369a1",
  "#3730a3",
  "#047857",
]
const FEMALE_COLORS = [
  "#db2777",
  "#be185d",
  "#c026d3",
  "#9d174d",
  "#e11d48",
  "#a21caf",
  "#f472b6",
  "#f43f5e",
  "#ec4899",
  "#d946ef",
  "#f97316",
  "#f59e0b",
]
const NEUTRAL_COLORS = ["#7c3aed", "#a78bfa", "#8b5cf6", "#6d28d9"]

function hashToIndex(str: string, mod: number): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % mod
}

function lookupCoords(
  cityName: string | null,
  uf: string,
): { lat: number; lng: number } | null {
  // Try "City, UF" through the curated table; falls back to state capital.
  const resolved =
    locateCity(cityName ? `${cityName}, ${uf}` : uf) ?? locateCity(uf)
  return resolved ? { lat: resolved.lat, lng: resolved.lng } : null
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)))
}

const LeafletMap = dynamic(() => import("./BrazilLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center text-xs text-muted">
      carregando mapa…
    </div>
  ),
})

export function BrazilMap({
  userPins,
  ufCounts,
}: {
  userPins: UserPin[]
  ufCounts: Array<{ uf: string; count: number }>
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const markers: LeafletMarker[] = useMemo(() => {
    const out: LeafletMarker[] = []
    // Group by city so we can jitter overlapping pins, like amazing-school.
    const byCity = new Map<string, UserPin[]>()
    for (const p of userPins) {
      const k = `${p.city_name ?? ""}|${p.uf}`
      const list = byCity.get(k) ?? []
      list.push(p)
      byCity.set(k, list)
    }
    for (const pins of byCity.values()) {
      const count = pins.length
      pins.forEach((p, i) => {
        // Prefer the authoritative lat/lng saved on the profile; only fall
        // back to the curated/state-capital table when they're missing.
        const coords =
          p.lat != null && p.lng != null
            ? { lat: p.lat, lng: p.lng }
            : lookupCoords(p.city_name, p.uf)
        if (!coords) return
        let { lat, lng } = coords
        if (count > 1) {
          const r = 0.18 + Math.min(0.35, count * 0.025)
          const angle = (i / count) * 2 * Math.PI
          lat += r * Math.sin(angle)
          lng += r * Math.cos(angle)
        }
        const seed = `${p.display_name ?? p.email ?? p.user_id}|${p.gender ?? ""}`
        let color: string
        if (p.gender === "M") {
          color = MALE_COLORS[hashToIndex(seed, MALE_COLORS.length)]!
        } else if (p.gender === "F") {
          color = FEMALE_COLORS[hashToIndex(seed, FEMALE_COLORS.length)]!
        } else {
          color = NEUTRAL_COLORS[hashToIndex(seed, NEUTRAL_COLORS.length)]!
        }
        out.push({
          lat,
          lng,
          color,
          name: p.display_name || p.email || "Usuário",
          city: p.city_name ? `${p.city_name} · ${p.uf}` : p.uf,
          daysSinceSignup: daysSince(p.created_at),
          gender: p.gender,
        })
      })
    }
    return out
  }, [userPins])

  const maleCount = userPins.filter((p) => p.gender === "M").length
  const femaleCount = userPins.filter((p) => p.gender === "F").length
  const unknownCount = userPins.length - maleCount - femaleCount

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-3 rounded-md border border-border bg-subtle px-3 py-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: MALE_COLORS[0] }}
          />
          Masculino · {maleCount}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: FEMALE_COLORS[0] }}
          />
          Feminino · {femaleCount}
        </span>
        {unknownCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: NEUTRAL_COLORS[0] }}
            />
            ? · {unknownCount}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-sm">
        {markers.length === 0 ? (
          <div className="flex h-[480px] items-center justify-center text-sm text-muted">
            Nenhum usuário com cidade registrada.
          </div>
        ) : (
          <LeafletMap markers={markers} dark={isDark} />
        )}
      </div>

      {ufCounts.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {ufCounts
            .filter((u) => u.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((u) => (
              <span
                key={u.uf}
                className="flex items-center gap-1 rounded-full border border-border bg-subtle px-2 py-0.5"
              >
                <span className="font-mono font-semibold text-strong">{u.uf}</span>
                <span className="text-muted">· {u.count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
