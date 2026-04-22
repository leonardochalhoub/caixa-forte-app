"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { createCategoryAction } from "../actions"

interface Category {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
}

const ROOT_SENTINEL = "__root__"

export function NewCategoryButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string>(ROOT_SENTINEL)
  const [type, setType] = useState<"income" | "expense">("expense")
  const [isFormalIncome, setIsFormalIncome] = useState(false)
  const [pending, start] = useTransition()

  // Only top-level categories are selectable as a parent (we don't support
  // deeper nesting).
  const parents = categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const isSubcategory = parentId !== ROOT_SENTINEL
  const parent = parents.find((p) => p.id === parentId) ?? null

  function reset() {
    setName("")
    setParentId(ROOT_SENTINEL)
    setType("expense")
    setIsFormalIncome(false)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    start(async () => {
      try {
        await createCategoryAction({
          name: name.trim(),
          parentId: isSubcategory ? parentId : null,
          isIncome: isSubcategory ? (parent?.is_income ?? false) : type === "income",
          isFormalIncome,
        })
        toast.success(`"${name.trim()}" criada.`)
        reset()
        setOpen(false)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        className="gap-1.5"
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
        Nova categoria
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
          <DialogDescription>
            Crie uma categoria nova ou uma subcategoria dentro de uma existente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Cafés, Pet, Impostos..."
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Onde colocar</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_SENTINEL}>
                  Nova categoria (topo)
                </SelectItem>
                {parents.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Como subcategoria de</SelectLabel>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {p.is_income ? "· entrada" : "· saída"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {!isSubcategory && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  aria-pressed={type === "expense"}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    type === "expense"
                      ? "border-strong bg-subtle text-strong"
                      : "border-border text-body hover:border-muted"
                  }`}
                >
                  Saída
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  aria-pressed={type === "income"}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    type === "income"
                      ? "border-strong bg-subtle text-strong"
                      : "border-border text-body hover:border-muted"
                  }`}
                >
                  Entrada
                </button>
              </div>
            </div>
          )}

          {((isSubcategory && parent?.is_income) ||
            (!isSubcategory && type === "income")) && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-subtle p-3 text-sm">
              <input
                type="checkbox"
                checked={isFormalIncome}
                onChange={(event) => setIsFormalIncome(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-strong">Conta como renda formal</span>
                <span className="block text-xs text-muted">
                  Só entradas marcadas aparecem em “Entrada do mês”. Deixe
                  desmarcado para saldos iniciais, ajustes, reembolsos etc.
                </span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={pending || !name.trim()}>
              {pending ? "Criando..." : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
