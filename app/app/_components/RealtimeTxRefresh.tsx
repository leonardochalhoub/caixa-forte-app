"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/browser"

// Inscrito em mudanças na tabela transactions; quando o webhook do
// Telegram insere uma tx (ou outra aba da mesma sessão muda algo),
// força router.refresh() pra rerenderizar os Server Components.
//
// RLS filtra automaticamente: o user só recebe events das próprias
// rows. Sem polling, sem websocket cru — só Supabase channel.
export function RealtimeTxRefresh({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`tx-${userId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Debounce mínimo via microtask — múltiplos eventos do
          // mesmo write batch viram um único refresh.
          queueMicrotask(() => router.refresh())
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router, userId])

  return null
}
