"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/browser"

// Inscrito em mudanças nas tabelas transactions + accounts; quando o
// webhook do Telegram insere uma tx (ou outra aba da mesma sessão muda
// algo), força router.refresh() pra rerenderizar os Server Components.
//
// RLS filtra automaticamente: o user só recebe events das próprias
// rows. Sem polling, sem websocket cru — só Supabase channel.
//
// Contas (accounts) também escutadas pra refletir abertura/fechamento
// de conta, ajuste de closing_day, edição de opening_balance numa aba
// instantaneamente nas outras.
export function RealtimeTxRefresh({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient()
    const refresh = () => queueMicrotask(() => router.refresh())
    const channel = supabase
      .channel(`live-${userId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "accounts",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router, userId])

  return null
}
