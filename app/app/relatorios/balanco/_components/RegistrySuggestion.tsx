"use client"

import { Mic, MicOff, Sparkles } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { transcribeAudioOnlyAction } from "@/app/app/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import {
  formatCentsAsBRLInput,
  findKindIndexByKey,
  REGISTRY_KINDS,
  type RegistryKind,
} from "@/lib/balanco/registry-helpers"

type SuggestResponse =
  | {
      ok: true
      kind: string
      description: string
      debit_section: string
      debit_label: string
      credit_section: string
      credit_label: string
      amount_cents: number | null
      note: string | null
    }
  | { ok: false; error: string }

export type RegistrySuggestionApply = {
  description: string
  debitSection: string
  debitLabel: string
  creditSection: string
  creditLabel: string
  amount?: string
  note?: string
  kindIdx?: number
}

export function RegistrySuggestion({
  onApply,
  kinds = REGISTRY_KINDS,
}: {
  onApply: (next: RegistrySuggestionApply) => void
  kinds?: readonly RegistryKind[]
}) {
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiPending, startAi] = useTransition()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  function runAI(prompt: string) {
    startAi(async () => {
      try {
        const res = await fetch("/api/ai/suggest-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: prompt }),
        })
        const r = (await res.json().catch(() => null)) as SuggestResponse | null
        if (!r) {
          toast.error(`IA falhou: resposta inválida (HTTP ${res.status}).`)
          return
        }
        if (!r.ok) {
          toast.error(`IA: ${r.error}`)
          return
        }
        const apply: RegistrySuggestionApply = {
          description: r.description,
          debitSection: r.debit_section,
          debitLabel: r.debit_label,
          creditSection: r.credit_section,
          creditLabel: r.credit_label,
        }
        if (r.amount_cents != null) {
          apply.amount = formatCentsAsBRLInput(r.amount_cents)
        }
        if (r.note) apply.note = r.note
        const idx = findKindIndexByKey(kinds, r.kind)
        if (idx >= 0) apply.kindIdx = idx
        onApply(apply)
        toast.success("IA sugeriu os campos — revise e ajuste.")
      } catch (err) {
        toast.error(
          `IA falhou: ${(err as Error).message}. Edite o texto e tente de novo, ou preencha manualmente.`,
        )
      }
    })
  }

  function transcribeAndSuggest(blob: Blob) {
    setTranscribing(true)
    // Transcreve primeiro, mostra no textbox, depois IA preenche.
    // Isso garante que o user vê o texto mesmo se a IA falhar.
    ;(async () => {
      try {
        const fd = new FormData()
        fd.append("audio", blob, "registro.webm")
        const t = await transcribeAudioOnlyAction(fd)
        if (!t.ok || !t.text) {
          toast.error(t.error ?? "Não consegui transcrever.")
          return
        }
        const txt = t.text!
        setAiPrompt(txt)
        // Pequeno delay pra UI atualizar antes de chamar IA
        setTimeout(() => runAI(txt), 100)
      } catch (err) {
        toast.error((err as Error).message)
      } finally {
        setTranscribing(false)
      }
    })()
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

  function askAI() {
    if (aiPrompt.trim().length < 3) {
      toast.error("Escreva pelo menos uma frase do que você quer registrar.")
      return
    }
    runAI(aiPrompt.trim())
  }

  return (
    <div className="space-y-2 rounded-lg border border-strong/20 bg-subtle p-3">
      <Label
        htmlFor="reg-ai"
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-strong"
      >
        <Sparkles className="h-3 w-3" />
        Descreva e a IA preenche
        <span className="ml-1 rounded-full border border-border bg-canvas px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-muted">
          Llama 3.3 70B · Groq
        </span>
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
  )
}
