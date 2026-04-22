"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, MapPin } from "lucide-react"
import {
  BR_STATES,
  loadIbgeCities,
  normalizeSearch,
  type IbgeCity,
} from "@/lib/ibge"

export interface SelectedCity {
  ibge_id: number
  name: string
  uf: string
}

export function CityPicker({
  value,
  onChange,
  required,
  id,
}: {
  value: SelectedCity | null
  onChange: (city: SelectedCity | null) => void
  required?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [ufFilter, setUfFilter] = useState<string>("")
  const [cities, setCities] = useState<IbgeCity[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || cities.length > 0) return
    setLoading(true)
    loadIbgeCities()
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoading(false))
  }, [open, cities.length])

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

  const filtered = useMemo(() => {
    if (!cities.length) return []
    const q = normalizeSearch(query)
    const matches = cities.filter((c) => {
      if (ufFilter && c.uf !== ufFilter) return false
      if (!q) return true
      return normalizeSearch(c.name).includes(q)
    })
    return matches.slice(0, 80)
  }, [cities, query, ufFilter])

  const label = value ? `${value.name} · ${value.uf}` : "Selecione sua cidade"

  return (
    <div ref={containerRef} className="relative">
      <input
        type="hidden"
        id={id}
        required={required}
        value={value?.ibge_id ?? ""}
        readOnly
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-left text-sm text-strong transition-colors hover:border-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-muted" />
          <span className={`truncate ${value ? "" : "text-muted"}`}>{label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-border bg-canvas shadow-lg">
          <div className="space-y-2 border-b border-border p-2">
            <div className="flex gap-1.5">
              <select
                value={ufFilter}
                onChange={(event) => setUfFilter(event.target.value)}
                className="h-9 w-24 rounded border border-border bg-canvas px-2 text-sm text-strong focus:outline-none focus:ring-1 focus:ring-strong"
              >
                <option value="">UF</option>
                {BR_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.uf}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cidade..."
                className="h-9 w-full rounded border border-border bg-canvas px-3 text-sm text-strong placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-strong"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-auto">
            {loading ? (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando cidades do IBGE...
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">
                {cities.length === 0
                  ? "Clique para carregar a lista."
                  : "Nenhuma cidade encontrada."}
              </p>
            ) : (
              <ul role="listbox">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ ibge_id: c.id, name: c.name, uf: c.uf })
                        setOpen(false)
                        setQuery("")
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-subtle hover:text-strong"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted">{c.uf}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
