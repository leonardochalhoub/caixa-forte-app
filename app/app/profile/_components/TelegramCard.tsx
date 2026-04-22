"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, Copy, Key, MessageSquare, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import {
  generateTelegramTokenAction,
  getTelegramStatusAction,
  unlinkTelegramAction,
  type TelegramStatus,
} from "../telegram-actions"

interface Props {
  botUsername?: string
  initial?: TelegramStatus
}

function formatRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "expirado"
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

export function TelegramCard({
  botUsername = "caixaforteapp_bot",
  initial,
}: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(initial ?? null)
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)
  const [remaining, setRemaining] = useState<string | null>(null)

  // Initial fetch when no SSR status was provided.
  useEffect(() => {
    if (status) return
    getTelegramStatusAction().then(setStatus).catch(() => setStatus(null))
  }, [status])

  // Live countdown on the active token.
  useEffect(() => {
    if (!status?.tokenExpiresAt) {
      setRemaining(null)
      return
    }
    const tick = () => setRemaining(formatRemaining(status.tokenExpiresAt!))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [status?.tokenExpiresAt])

  function handleGenerate() {
    start(async () => {
      try {
        const next = await generateTelegramTokenAction()
        setStatus(next)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleUnlink() {
    if (!confirm("Desvincular o Telegram? Você precisará gerar um novo token para reconectar."))
      return
    start(async () => {
      try {
        const next = await unlinkTelegramAction()
        setStatus(next)
        toast.success("Telegram desvinculado.")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  async function copyStartCommand() {
    if (!status?.token) return
    try {
      await navigator.clipboard.writeText(`/start ${status.token}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não consegui copiar.")
    }
  }

  const linked = !!status?.linked
  const hasActiveToken = !!status?.token

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Telegram
        </CardTitle>
        <CardDescription>
          {linked
            ? "Seu Telegram está vinculado. Mande uma mensagem ou áudio para o bot e a transação entra sozinha."
            : "Registre ganhos e gastos direto no Telegram. Vincule o chat em 10 segundos."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {linked && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-subtle p-3 text-sm">
            <span className="flex items-center gap-2 text-body">
              <Check className="h-4 w-4 text-income" />
              Conta vinculada ao chat <span className="font-mono text-strong">{status?.chatId}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={pending}
              className="gap-1.5"
            >
              <Unlink className="h-3.5 w-3.5" />
              Desvincular
            </Button>
          </div>
        )}

        {!linked && hasActiveToken && (
          <div className="space-y-3 rounded-lg border border-border bg-subtle p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
              Token ativo · expira em {remaining ?? "—"}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-canvas p-2">
              <code className="flex-1 font-mono text-sm text-strong">
                /start {status?.token}
              </code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={copyStartCommand}
                className="h-7 gap-1 px-2 text-xs"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <ol className="space-y-1.5 pl-5 text-xs text-body [list-style:decimal]">
              <li>
                Abra{" "}
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-strong underline underline-offset-2"
                >
                  @{botUsername}
                </a>{" "}
                no Telegram.
              </li>
              <li>Cole o comando acima na conversa e envie.</li>
              <li>Aguarde a confirmação — o chat fica vinculado na hora.</li>
            </ol>
          </div>
        )}

        {!linked && (
          <Button
            onClick={handleGenerate}
            disabled={pending}
            className="gap-2"
            variant={hasActiveToken ? "outline" : "default"}
          >
            <Key className="h-4 w-4" />
            {hasActiveToken ? "Gerar novo token" : "Gerar token Telegram"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
