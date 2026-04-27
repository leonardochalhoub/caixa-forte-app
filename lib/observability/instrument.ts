// Caixa Forte — instrumentation pública pra erros + métricas críticas
// Conselho v4 (eng-software, planner): "Sem Sentry/observabilidade,
// próximos bugs do user externo viram detetive manual."
//
// Esta camada centraliza captura de exceção. Hoje só loga via logger
// estruturado JSON (visível em Vercel Functions logs). Quando precisar
// de Sentry/Logflare/Axiom, é drop-in:
//
//   1. npm i @sentry/nextjs
//   2. importa e chama Sentry.captureException(err) abaixo
//   3. setar SENTRY_DSN no env
//
// API estável agora, infra plugável depois.

import { logger } from "./logger"

interface CaptureContext {
  /** Onde aconteceu — ex.: "telegram-webhook", "cron-snapshot", "pay-invoice" */
  scope: string
  /** UserId quando disponível, pra correlacionar erros por usuário */
  userId?: string
  /** Dados extras pra debug */
  extra?: Record<string, unknown>
}

export function captureException(
  err: unknown,
  ctx: CaptureContext,
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  logger.error(`[${ctx.scope}] ${error.message}`, {
    scope: ctx.scope,
    userId: ctx.userId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...ctx.extra,
  })

  // Hook futuro pra Sentry — quando dep instalada e SENTRY_DSN setado:
  //
  //   import * as Sentry from "@sentry/nextjs"
  //   if (process.env.SENTRY_DSN) {
  //     Sentry.captureException(error, {
  //       tags: { scope: ctx.scope },
  //       user: ctx.userId ? { id: ctx.userId } : undefined,
  //       extra: ctx.extra,
  //     })
  //   }
}

/**
 * Marca evento de negócio relevante (ex.: pagamento de fatura, novo
 * snapshot diário). Útil pra rastrear funil sem precisar de analytics
 * client-side. Hoje só loga; futuro plugável pra event tracker.
 */
export function trackEvent(name: string, ctx?: Record<string, unknown>): void {
  logger.info(`event:${name}`, { event: name, ...ctx })
}
