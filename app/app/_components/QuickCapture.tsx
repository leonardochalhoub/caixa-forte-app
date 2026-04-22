"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowUpRight, Loader2, Mic, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import { captureFromTextAction, transcribeAudioOnlyAction } from "../actions"

interface Props {
  hasGroqKey: boolean
  hasAccounts: boolean
}

const MIN_CONFIDENCE = 0.55

// Minimal typings for the browser SpeechRecognition API (still prefixed in most browsers).
type SREvent = { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }
interface SRInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SREvent) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SRConstructor = new () => SRInstance

function getSR(): SRConstructor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor
    webkitSpeechRecognition?: SRConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function QuickCapture({ hasGroqKey, hasAccounts }: Props) {
  const [text, setText] = useState("")
  const [pending, start] = useTransition()
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const srRef = useRef<SRInstance | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const liveTextRef = useRef<string>("")

  const disabled = !hasGroqKey || !hasAccounts
  const inputDisabled = disabled || pending || recording || transcribing

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stream.getTracks().forEach((t) => t.stop())
      }
      if (srRef.current) {
        try {
          srRef.current.stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  async function autoSubmit(rawInput: string) {
    start(async () => {
      try {
        const result = await captureFromTextAction({ rawInput })
        if (result.ok && result.parsed) {
          if (result.parsed.confidence < MIN_CONFIDENCE) {
            toast.error("Não ficou claro.", {
              description: `Confiança ${(result.parsed.confidence * 100).toFixed(0)}%. Tenta de novo falando mais direto.`,
            })
            setText("")
            return
          }
          const sign = result.parsed.type === "income" ? "+" : "−"
          toast.success(`${sign} ${formatBRL(result.parsed.amountCents)} · ${result.parsed.categoryName}`, {
            description: result.parsed.merchant ?? formatPtBrDateShort(result.parsed.occurredOn),
          })
          setText("")
        } else {
          toast.error(result.error ?? "Não consegui interpretar — tenta escrever ou falar de novo.")
          setText("")
        }
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) return
    autoSubmit(text)
  }

  async function startRecording() {
    if (disabled || pending) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      liveTextRef.current = ""
      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        sendForTranscription(new Blob(chunksRef.current, { type: mime || "audio/webm" }))
      }
      rec.start()
      mediaRef.current = rec

      // Live partial transcription via browser SpeechRecognition (Chrome/Safari).
      const SR = getSR()
      if (SR) {
        const sr = new SR()
        sr.continuous = true
        sr.interimResults = true
        sr.lang = "pt-BR"
        sr.onresult = (event) => {
          let transcript = ""
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i]![0].transcript
          }
          liveTextRef.current = transcript.trim()
          setText(liveTextRef.current)
        }
        sr.onerror = () => {
          /* ignore; Whisper handles final */
        }
        try {
          sr.start()
          srRef.current = sr
        } catch {
          srRef.current = null
        }
      }

      startedAtRef.current = Date.now()
      setRecordingMs(0)
      timerRef.current = window.setInterval(() => {
        if (startedAtRef.current) setRecordingMs(Date.now() - startedAtRef.current)
      }, 100)
      setRecording(true)
    } catch (err) {
      toast.error("Não consegui acessar o microfone.", {
        description: (err as Error).message,
      })
    }
  }

  function stopRecording() {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop()
    }
    if (srRef.current) {
      try {
        srRef.current.stop()
      } catch {
        /* ignore */
      }
      srRef.current = null
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
  }

  function sendForTranscription(blob: Blob) {
    setTranscribing(true)
    start(async () => {
      try {
        const fd = new FormData()
        fd.append("audio", blob, "captura.webm")
        const result = await transcribeAudioOnlyAction(fd)
        if (result.ok && result.text) {
          setText(result.text)
          setTranscribing(false)
          // Auto-submit after Whisper returns accurate transcription.
          autoSubmit(result.text)
        } else {
          toast.error(result.error ?? "Não consegui transcrever o áudio.")
          setTranscribing(false)
        }
      } catch (error) {
        toast.error((error as Error).message)
        setTranscribing(false)
      }
    })
  }

  const placeholder = disabled
    ? hasAccounts
      ? "Configure GROQ_API_KEY em .env.local para habilitar"
      : "Crie uma conta antes em /app/contas"
    : 'Escreva ou fale: "gastei 25 no ifood ontem"'

  return (
    <section className="relative space-y-3">
      <form onSubmit={handleSubmit} className="group relative">
        <div className="relative flex items-stretch gap-2 rounded-2xl border border-border bg-canvas p-2 shadow-sm transition-colors focus-within:border-strong">
          <div className="hidden items-center pl-3 pr-1 text-muted sm:flex">
            <Sparkles className="h-5 w-5 shrink-0" />
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                if (text.trim()) event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={placeholder}
            disabled={inputDisabled}
            rows={2}
            className="peer min-h-[64px] w-full resize-none bg-transparent px-2 py-3 text-left text-canvas text-strong placeholder:text-muted focus:outline-none disabled:cursor-not-allowed [align-content:center] sm:min-h-0 sm:flex-1 sm:px-1 sm:py-4 sm:text-lg"
            autoComplete="off"
          />

          <div className="flex flex-col items-center justify-between gap-1 py-1 sm:flex-row sm:gap-2">
            {/* BIG MIC — primary voice action */}
            {!recording ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={startRecording}
                disabled={disabled || pending || transcribing}
                aria-label="Falar"
                title="Falar com o microfone"
                className="h-16 w-16 shrink-0 rounded-full border border-border bg-subtle text-strong hover:bg-border sm:h-20 sm:w-20"
              >
                {transcribing ? (
                  <Loader2 className="h-7 w-7 animate-spin sm:h-8 sm:w-8" />
                ) : (
                  <Mic className="h-7 w-7 sm:h-8 sm:w-8" />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={stopRecording}
                aria-label="Parar e enviar"
                title="Parar e enviar"
                className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-expense text-canvas hover:bg-expense/90 sm:h-20 sm:w-20"
              >
                <Square className="h-6 w-6 fill-current sm:h-7 sm:w-7" />
              </Button>
            )}

            {/* small Registrar — for typed input only */}
            <Button
              type="submit"
              disabled={inputDisabled || !text.trim()}
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1 rounded-lg px-2.5 text-xs"
              title="Enviar texto"
            >
              {pending && !transcribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpRight className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <p>
          <span className="font-mono">Enter</span> envia texto · clique no{" "}
          <Mic className="inline h-3 w-3 align-[-2px]" /> pra falar (envia automático ao parar)
          {!hasGroqKey && <span className="ml-2 text-expense">⚠ Groq não configurado</span>}
        </p>
        {recording && (
          <span className="flex items-center gap-1.5 font-mono text-expense">
            <span className="h-2 w-2 animate-pulse rounded-full bg-expense" />
            gravando · {formatDuration(recordingMs)}
          </span>
        )}
        {transcribing && !recording && (
          <span className="flex items-center gap-1 text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            transcrevendo…
          </span>
        )}
      </div>
    </section>
  )
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}
