"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Props {
  align?: "center" | "start" | "end"
}

/**
 * Compact pill that opens a full privacy-details modal. Designed to sit
 * inline on landing / signup / profile without dominating the layout.
 * Content stays the same three sections as before; only the container got
 * sexier.
 */
export function PrivacyDisclaimer({ align = "center" }: Props) {
  const [open, setOpen] = useState(false)
  const alignment =
    align === "start"
      ? "justify-start"
      : align === "end"
        ? "justify-end"
        : "justify-center"

  return (
    <div className={`flex ${alignment}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-subtle px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-body transition-colors hover:border-muted hover:text-strong"
      >
        <ShieldCheck className="h-3 w-3" />
        Privacidade
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-strong" />
              Transparência de dados
            </DialogTitle>
            <DialogDescription>
              Três listas honestas: o que coletamos, o que não vemos, e a
              ressalva técnica que fecha qualquer brecha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm text-body">
            <Block title="O que coletamos">
              <li>Nome, email, cidade/UF (IBGE) e foto que você informa.</li>
              <li>
                Saldos <strong>agregados</strong> (médio e mediano entre
                todos os usuários); nunca por conta individual.
              </li>
              <li>
                Eventos de login (data, IP, navegador) para segurança e
                detecção de acesso suspeito.
              </li>
              <li>Heartbeat de uso (quando o app foi aberto).</li>
            </Block>

            <Block title="O que nunca aparece em ferramentas administrativas">
              <li>Transações individuais: valor, estabelecimento, categoria, nota, data.</li>
              <li>Conteúdo de áudios ou mensagens do Telegram.</li>
              <li>Saldos de contas específicas (Banco X, cartão Y).</li>
              <li>
                Senha — armazenada com hash no Supabase; nem os admins
                recuperam, apenas emitem link de redefinição.
              </li>
              <li>Dados bancários reais (número de conta, agência, CPF).</li>
            </Block>

            <div className="rounded-md border border-border bg-subtle p-3 text-[12px] leading-relaxed">
              <strong className="block text-strong">Ressalva técnica.</strong>
              A equipe tem acesso ao banco para manutenção e backup. As
              ferramentas internas só exibem agregados; Row-Level Security
              está ativo em todas as tabelas. Nada é vendido, cedido ou
              compartilhado com terceiros.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Block({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted">
        {title}
      </h4>
      <ul className="space-y-1 pl-4 [list-style:square] text-[13px] leading-relaxed">
        {children}
      </ul>
    </div>
  )
}
