// Helper compartilhado pra autenticar chamadas das Vercel Cron Jobs.
// Aceita 2 fontes:
//   1. Header `x-vercel-cron: 1` — setado automaticamente pelo Vercel
//      nas chamadas internas do scheduler (sem env var necessária).
//   2. Bearer CRON_SECRET — usado pra chamadas manuais (curl/CLI) e
//      como hardening adicional quando o secret está setado.
//
// Antes a checagem exigia CRON_SECRET sempre — projetos que não setam
// o env caíam em 401 em toda chamada do Vercel, e jobs como o
// balance-snapshot diário ficavam silenciosamente quebrados.

export function isAuthorizedCron(req: Request): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get("authorization") === `Bearer ${secret}`
}
