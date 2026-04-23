"use client"

import { Mic, MicOff, Sparkles } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { transcribeAudioOnlyAction } from "@/app/app/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"

type AnalysisResponse =
  | { ok: true; analysis: string }
  | { ok: false; error: string }

export function BalancoAIInsight({
  snapshot,
}: {
  snapshot: Record<string, unknown>
}) {
  const [question, setQuestion] = useState("")
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    if (recording || transcribing || pending) return
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
        transcribe(blob)
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

  function transcribe(blob: Blob) {
    setTranscribing(true)
    ;(async () => {
      try {
        const fd = new FormData()
        fd.append("audio", blob, "pergunta.webm")
        const t = await transcribeAudioOnlyAction(fd)
        if (!t.ok || !t.text) {
          toast.error(t.error ?? "Não consegui transcrever.")
          return
        }
        setQuestion((prev) => (prev ? `${prev} ${t.text}` : t.text!))
      } catch (err) {
        toast.error((err as Error).message)
      } finally {
        setTranscribing(false)
      }
    })()
  }

  function run() {
    start(async () => {
      try {
        const res = await fetch("/api/ai/balanco-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot, question }),
        })
        const r = (await res.json().catch(() => null)) as AnalysisResponse | null
        if (!r) {
          toast.error(`IA falhou: resposta inválida (HTTP ${res.status}).`)
          return
        }
        if (!r.ok) {
          toast.error(r.error)
          return
        }
        setAnalysis(r.analysis)
      } catch (err) {
        toast.error(`IA falhou: ${(err as Error).message}`)
      }
    })
  }

  return (
    <section className="avoid-break space-y-3 rounded-xl border border-border bg-subtle/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="balanco-ai-question"
          className="flex items-center gap-1.5 text-sm font-medium text-strong"
        >
          <Sparkles className="h-4 w-4" />
          Opinião do Contador IA
          <span className="ml-1 rounded-full border border-border bg-canvas px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-muted">
            Llama 3.3 70B · Groq
          </span>
        </Label>
      </div>
      <p className="text-[11px] italic text-muted">
        Pergunte qualquer coisa sobre o balanço acima — ou deixe em branco para
        receber uma análise geral com pontos fortes, fracos e sugestão.
      </p>
      <div className="flex gap-2">
        <textarea
          id="balanco-ai-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder='Ex: "Estou bem posicionado pra comprar um imóvel?" ou "Onde estou concentrando risco?"'
          className="flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
          disabled={pending}
        />
        <Button
          type="button"
          size="sm"
          variant={recording ? "default" : "outline"}
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || pending}
          title={recording ? "Parar gravação" : "Gravar pergunta por áudio"}
          className={recording ? "shrink-0 self-start bg-expense text-white" : "shrink-0 self-start"}
        >
          {transcribing ? (
            <span className="text-[11px]">…</span>
          ) : recording ? (
            <MicOff className="h-3.5 w-3.5" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={run} disabled={pending || recording || transcribing}>
          {pending ? "Analisando…" : "Pedir análise"}
        </Button>
      </div>
      {analysis && (
        <div className="space-y-2 rounded-md border border-border bg-canvas p-3 text-sm leading-relaxed text-body">
          {analysis
            .split(/\n{2,}/)
            .map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p.trim()}
              </p>
            ))}
        </div>
      )}
    </section>
  )
}
