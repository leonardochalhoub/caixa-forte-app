"use client"

import { Mic, MicOff, Plus, Sparkles } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { transcribeAudioOnlyAction } from "@/app/app/actions"
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
import {
  createBalanceRegistryAction,
  suggestBalanceRegistryAction,
} from "../actions"

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

  const [aiPrompt, setAiPrompt] = useState("")
  const [aiPending, startAi] = useTransition()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
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

  async function startRecording() {
    if (recording || transcribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || "audio/webm",
        })
        transcribeAndSuggest(blob)
      }
      rec.start()
      mediaRef.current = rec
      setRecording(true)
    } catch (err) {
      toast.error("Sem acesso ao microfone.", {
        description: (err as Error).message,
      })
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    mediaRef.current = null
    setRecording(false)
  }

  function transcribeAndSuggest(blob: Blob) {
    setTranscribing(true)
    startAi(async () => {
      try {
        const fd = new FormData()
        fd.append("audio", blob, "registro.webm")
        const t = await transcribeAudioOnlyAction(fd)
        if (!t.ok || !t.text) {
          toast.error(t.error ?? "Não consegui transcrever.")
          setTranscribing(false)
          return
        }
        setAiPrompt(t.text)
        // Emenda: chama IA direto com o texto transcrito
        const r = await suggestBalanceRegistryAction({ description: t.text })
        setDescription(r.description)
        setDebitSection(r.debit_section)
        setDebitLabel(r.debit_label)
        setCreditSection(r.credit_section)
        setCreditLabel(r.credit_label)
        if (r.amount_cents != null) {
          setAmount(
            (r.amount_cents / 100)
              .toFixed(2)
              .replace(".", ",")
              .replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          )
        }
        if (r.note) setNote(r.note)
        const idx = KINDS.findIndex((k) => k.key === r.kind)
        if (idx >= 0) setKindIdx(idx)
        toast.success("Áudio processado — revise e ajuste.")
      } catch (err) {
        toast.error((err as Error).message)
      } finally {
        setTranscribing(false)
      }
    })
  }

  function askAI() {
    if (aiPrompt.trim().length < 3) {
      toast.error("Escreva pelo menos uma frase do que você quer registrar.")
      return
    }
    startAi(async () => {
      try {
        const r = await suggestBalanceRegistryAction({
          description: aiPrompt.trim(),
        })
        setDescription(r.description)
        setDebitSection(r.debit_section)
        setDebitLabel(r.debit_label)
        setCreditSection(r.credit_section)
        setCreditLabel(r.credit_label)
        if (r.amount_cents != null) {
          setAmount(
            (r.amount_cents / 100)
              .toFixed(2)
              .replace(".", ",")
              .replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          )
        }
        if (r.note) setNote(r.note)
        // Ajusta kindIdx pelo kind retornado
        const idx = KINDS.findIndex((k) => k.key === r.kind)
        if (idx >= 0) setKindIdx(idx)
        toast.success("Formulário preenchido pela IA — revise e ajuste.")
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo registro contábil</DialogTitle>
            <DialogDescription>
              Partida dobrada: o valor que entra em uma linha sai de outra.
              Descreva com IA ou escolha o tipo manualmente.
            </DialogDescription>
          </DialogHeader>

          {/* IA helper */}
          <div className="space-y-2 rounded-lg border border-strong/20 bg-subtle p-3">
            <Label
              htmlFor="reg-ai"
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-strong"
            >
              <Sparkles className="h-3 w-3" />
              Descreva e a IA preenche
            </Label>
            <div className="flex gap-2">
              <textarea
                id="reg-ai"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                placeholder='Fale ou escreva: "Paguei pensão alimentícia R$ 500 da Caixa EF"'
                className="flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
              />
              <div className="flex shrink-0 flex-col gap-1 self-start">
                <Button
                  type="button"
                  size="sm"
                  variant={recording ? "default" : "outline"}
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing || aiPending}
                  title={recording ? "Parar gravação" : "Gravar áudio"}
                  className={recording ? "bg-expense text-white" : ""}
                >
                  {transcribing ? (
                    <span className="text-[11px]">…</span>
                  ) : recording ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={askAI}
                  disabled={aiPending || recording || transcribing}
                >
                  {aiPending && !transcribing ? "…" : "Preencher"}
                </Button>
              </div>
            </div>
            <p className="text-[10px] italic text-muted">
              A IA só sugere — você revisa e edita antes de salvar.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {/* Linha 1: Tipo + Descrição + Valor */}
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_140px]">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-desc">Descrição</Label>
                <Input
                  id="reg-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Pagamento pensão alimentícia"
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
            </div>

            <p className="text-[10px] italic text-muted">{kind.hint}</p>

            {/* 2 colunas em desktop, empilha em mobile */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 rounded-lg border border-income/30 bg-income/5 p-3">
                <Label className="text-[10px] uppercase tracking-wider text-income">
                  Débito (entra na linha)
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
                  Crédito (sai da linha)
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-note">Observação (opcional)</Label>
              <textarea
                id="reg-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="flex min-h-[50px] w-full rounded-md border border-border bg-subtle px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
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
