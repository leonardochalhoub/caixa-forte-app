"use client"

import { Plus } from "lucide-react"
import { useState, useTransition } from "react"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { parseBRLToCents } from "@/lib/money"
import { createBalanceRegistryAction } from "../actions"

// Templates visíveis no UI (espelha REGISTRY_KINDS do server).
const KINDS = [
  {
    key: "compra_vista",
    label: "Compra à vista",
    hint: "Comprou um bem pagando com dinheiro da conta (ex: carro à vista).",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "O que você comprou",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "compra_financiada",
    label: "Compra financiada",
    hint: "Comprou um bem com financiamento/empréstimo.",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "Bem comprado",
    creditDefault: "passivo_nc_financiamentos",
    creditPlaceholder: "Nome do financiamento",
  },
  {
    key: "aporte",
    label: "Aporte / Capital inicial",
    hint: "Dinheiro que entrou de fora do sistema (presente, herança, capital).",
    debitDefault: "ativo_circulante_disponivel",
    debitPlaceholder: "Conta onde entrou",
    creditDefault: "patrimonio_liquido",
    creditPlaceholder: "Descrição do aporte",
  },
  {
    key: "retirada",
    label: "Retirada / Distribuição",
    hint: "Tirou dinheiro do patrimônio (retirada de lucros pra fora).",
    debitDefault: "patrimonio_liquido",
    debitPlaceholder: "Descrição da retirada",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "valorizacao",
    label: "Valorização / Desvalorização",
    hint: "Reavaliação de um ativo (imóvel subiu/caiu, FIPE atualizou).",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "Qual bem",
    creditDefault: "patrimonio_liquido",
    creditPlaceholder: "Motivo (ex: FIPE)",
  },
  {
    key: "pagamento_divida",
    label: "Pagamento de dívida",
    hint: "Pagou parcela ou quitou dívida com dinheiro da conta.",
    debitDefault: "passivo_nc_financiamentos",
    debitPlaceholder: "Qual dívida",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "emprestimo",
    label: "Empréstimo tomado",
    hint: "Pegou empréstimo — dinheiro cai na conta, cria dívida.",
    debitDefault: "ativo_circulante_disponivel",
    debitPlaceholder: "Conta que recebeu",
    creditDefault: "passivo_nc_financiamentos",
    creditPlaceholder: "Credor",
  },
] as const

const SECTIONS = [
  { value: "ativo_circulante_disponivel", label: "Ativo Circ. · Disponibilidades" },
  { value: "ativo_circulante_renda_fixa", label: "Ativo Circ. · Renda Fixa" },
  { value: "ativo_circulante_renda_variavel", label: "Ativo Circ. · Renda Variável" },
  { value: "ativo_circulante_cripto", label: "Ativo Circ. · Cripto" },
  { value: "ativo_circulante_outros", label: "Ativo Circ. · Outros" },
  { value: "ativo_nc_bloqueado", label: "Ativo NC · Bloqueado (FGTS)" },
  { value: "ativo_nc_imobilizado", label: "Ativo NC · Imobilizado" },
  { value: "ativo_nc_intangivel", label: "Ativo NC · Intangível" },
  { value: "passivo_circulante_cartoes", label: "Passivo Circ. · Cartões" },
  { value: "passivo_circulante_outros", label: "Passivo Circ. · Outros" },
  { value: "passivo_nc_financiamentos", label: "Passivo NC · Financiamentos" },
  { value: "patrimonio_liquido", label: "Patrimônio Líquido" },
] as const

export function AddRegistryButton({ period }: { period: string }) {
  const [open, setOpen] = useState(false)
  const [kindIdx, setKindIdx] = useState(0)
  const kind = KINDS[kindIdx]!

  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [debitSection, setDebitSection] = useState<string>(kind.debitDefault)
  const [debitLabel, setDebitLabel] = useState("")
  const [creditSection, setCreditSection] = useState<string>(kind.creditDefault)
  const [creditLabel, setCreditLabel] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()

  function selectKind(i: number) {
    setKindIdx(i)
    const k = KINDS[i]!
    setDebitSection(k.debitDefault)
    setCreditSection(k.creditDefault)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents == null || cents <= 0) {
      toast.error("Valor inválido.")
      return
    }
    start(async () => {
      try {
        await createBalanceRegistryAction({
          period,
          kind: kind.key,
          description: description.trim(),
          amountCents: cents,
          debitSection,
          debitLabel: debitLabel.trim(),
          creditSection,
          creditLabel: creditLabel.trim(),
          note: note.trim() || null,
        })
        toast.success("Registro criado.")
        setDescription("")
        setAmount("")
        setDebitLabel("")
        setCreditLabel("")
        setNote("")
        setOpen(false)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar Registro
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo registro contábil</DialogTitle>
            <DialogDescription>
              Partida dobrada: o valor que entra em uma linha sai de outra.
              Escolha o tipo abaixo — a gente pré-preenche os lados certos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de operação</Label>
              <Select
                value={String(kindIdx)}
                onValueChange={(v) => selectKind(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k, i) => (
                    <SelectItem key={k.key} value={String(i)}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs italic text-muted">{kind.hint}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-desc">Descrição da operação</Label>
              <Input
                id="reg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Compra carro Renault Kwid"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-amount">Valor (R$)</Label>
              <Input
                id="reg-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>

            <div className="space-y-1.5 rounded-lg border border-income/30 bg-income/5 p-3">
              <Label className="text-[10px] uppercase tracking-wider text-income">
                Débito (entra na)
              </Label>
              <Select value={debitSection} onValueChange={setDebitSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={debitLabel}
                onChange={(e) => setDebitLabel(e.target.value)}
                placeholder={kind.debitPlaceholder}
                required
              />
            </div>

            <div className="space-y-1.5 rounded-lg border border-expense/30 bg-expense/5 p-3">
              <Label className="text-[10px] uppercase tracking-wider text-expense">
                Crédito (sai da)
              </Label>
              <Select value={creditSection} onValueChange={setCreditSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={creditLabel}
                onChange={(e) => setCreditLabel(e.target.value)}
                placeholder={kind.creditPlaceholder}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-note">Observação (opcional)</Label>
              <textarea
                id="reg-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-border bg-subtle px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
                placeholder="Nota explicativa, fonte, contexto"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Registrando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
