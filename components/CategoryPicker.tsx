"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ChevronDown, Loader2, Plus, Search } from "lucide-react"
import { toast } from "@/components/ui/toast"
import { createCategoryAction } from "@/app/app/categorias/actions"

export interface Category {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
}

interface Props {
  categories: Category[]
  value: string
  onChange: (id: string) => void
  /**
   * Restrict listed categories to one side of the income/expense divide.
   * Matches the transaction's type when editing so expenses can only be
   * tagged with expense categories.
   */
  filterIsIncome?: boolean
  /** Force the dropdown to render above the trigger. */
  direction?: "up" | "down"
  placeholder?: string
  /** Called right after a new category is created so parents can refresh. */
  onCreated?: (newCategory: Category) => void
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  filterIsIncome,
  direction = "down",
  placeholder = "Sem categoria",
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [pending, start] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (open) searchInputRef.current?.focus()
  }, [open])

  const { scoped, options } = useMemo(() => {
    const scopedList =
      filterIsIncome == null
        ? categories
        : categories.filter((c) => c.is_income === filterIsIncome)
    const byId = new Map(scopedList.map((c) => [c.id, c]))
    const list = scopedList.map((c) => {
      if (c.parent_id) {
        const parent = byId.get(c.parent_id)
        return { ...c, label: parent ? `${parent.name} > ${c.name}` : c.name }
      }
      return { ...c, label: c.name }
    })
    const q = normalize(query)
    const filtered = q
      ? list.filter((c) => normalize(c.label).includes(q))
      : list
    filtered.sort((a, b) => a.label.localeCompare(b.label))
    return { scoped: scopedList, options: filtered }
  }, [categories, filterIsIncome, query])

  const selected = categories.find((c) => c.id === value) ?? null
  const selectedLabel = selected
    ? selected.parent_id
      ? (() => {
          const parent = categories.find((p) => p.id === selected.parent_id)
          return parent ? `${parent.name} > ${selected.name}` : selected.name
        })()
      : selected.name
    : ""

  // "Criar" button appears when the typed text doesn't match any existing
  // category. Treats subcategory-path syntax "Parent > Sub" so the user can
  // nest directly from the picker.
  const trimmed = query.trim()
  const hasExact =
    trimmed.length > 0 &&
    scoped.some((c) => normalize(c.name) === normalize(trimmed))
  const canCreate = trimmed.length > 0 && !hasExact

  function handleCreate() {
    if (!canCreate) return
    // Infer type from filterIsIncome when present; otherwise default to
    // expense (callers tag the type elsewhere anyway).
    const isIncome = filterIsIncome ?? false
    const parsedParent = trimmed.includes(">")
      ? scoped.find(
          (c) =>
            !c.parent_id &&
            normalize(c.name) === normalize(trimmed.split(">")[0]!),
        ) ?? null
      : null
    const rawName = parsedParent
      ? trimmed.split(">").slice(1).join(">").trim()
      : trimmed
    if (!rawName) return
    setCreating(true)
    start(async () => {
      try {
        const created = await createCategoryAction({
          name: rawName,
          parentId: parsedParent?.id ?? null,
          isIncome,
          isFormalIncome: false,
        })
        const newCat: Category = {
          id: created.id,
          name: rawName,
          parent_id: parsedParent?.id ?? null,
          is_income: parsedParent?.is_income ?? isIncome,
        }
        onCreated?.(newCat)
        onChange(created.id)
        toast.success(`"${rawName}" criada.`)
        setQuery("")
        setOpen(false)
      } catch (error) {
        toast.error((error as Error).message)
      } finally {
        setCreating(false)
      }
    })
  }

  const dropdownPlacement =
    direction === "up"
      ? "bottom-full mb-1"
      : "top-full mt-1"

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-left text-sm text-strong transition-colors hover:border-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selectedLabel ? "" : "text-muted"}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-40 overflow-hidden rounded-md border border-border bg-canvas shadow-lg ${dropdownPlacement}`}
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canCreate && options.length === 0) {
                    event.preventDefault()
                    handleCreate()
                  }
                }}
                placeholder="Buscar ou criar..."
                className="h-9 w-full rounded border border-border bg-canvas pl-8 pr-2 text-sm text-strong placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-strong"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">
                Nenhuma categoria encontrada.
              </p>
            ) : (
              <ul role="listbox">
                {options.map((c) => {
                  const isSelected = c.id === value
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(c.id)
                          setQuery("")
                          setOpen(false)
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-subtle hover:text-strong ${
                          isSelected
                            ? "bg-subtle font-medium text-strong"
                            : "text-body"
                        }`}
                      >
                        <span className="truncate">{c.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || pending}
              className="flex w-full items-center gap-2 border-t border-border bg-subtle px-3 py-2 text-left text-sm text-strong transition-colors hover:bg-border disabled:opacity-60"
            >
              {creating || pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Criar <strong>&quot;{trimmed}&quot;</strong>
              {filterIsIncome != null && (
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
                  {filterIsIncome ? "entrada" : "saída"}
                </span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
