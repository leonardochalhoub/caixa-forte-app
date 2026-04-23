"use client"

import { useEffect } from "react"

/**
 * Guard pra sessão da conta de demonstração (Larissa).
 *
 * Enquanto a tab tá aberta, Larissa permanece logada. Assim que o usuário
 * fecha a tab ou navega pra fora do app, o browser dispara pagehide,
 * e a gente chama /logout via sendBeacon (fire-and-forget, sobrevive
 * ao teardown da página) pra limpar os cookies de servidor.
 *
 * Isso garante que:
 *  - Fechou a tab da Larissa? Na próxima vez que abrir qualquer coisa
 *    no domínio, não tá mais logada como ela.
 *  - "Entrar" na landing pede senha de verdade, não volta pra conta demo.
 *
 * Renderizado APENAS quando o usuário logado é demo (is_demo=true).
 */
export function DemoTabGuard() {
  useEffect(() => {
    const signOut = () => {
      // sendBeacon é o único que a spec garante ser entregue durante
      // unload. Fetch com keepalive também serve; uso os dois pra
      // maximizar compatibilidade.
      try {
        navigator.sendBeacon?.("/logout")
      } catch {
        // ignore
      }
      try {
        fetch("/logout", { method: "POST", keepalive: true }).catch(() => {})
      } catch {
        // ignore
      }
    }

    // pagehide cobre fechamento de tab/navigator + navigation pra outra
    // origem. visibilitychange com hidden cobre mudança de tab, mas
    // queremos só fechar tab/janela, então uso pagehide puro.
    const onPageHide = (e: PageTransitionEvent) => {
      // persisted=true significa bfcache (volta da aba, NÃO fecha).
      // Só queremos sign-out quando for teardown de verdade.
      if (!e.persisted) signOut()
    }

    window.addEventListener("pagehide", onPageHide)
    return () => window.removeEventListener("pagehide", onPageHide)
  }, [])

  return null
}
