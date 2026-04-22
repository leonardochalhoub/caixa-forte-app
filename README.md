# Caixa Forte

App pessoal de controle financeiro (pt-br) — registre ganhos e gastos em segundos via texto no navegador ou voz no Telegram, com auto-categorização por Groq e dashboard monocromático.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui** (paleta monocromática)
- **Supabase** (Postgres + RLS + Auth magic link)
- **Groq** (`llama-3.3-70b-versatile` + `whisper-large-v3`)
- **Vercel** (hosting + Cron)

## Milestones

| M | Escopo | Status |
|---|--------|--------|
| **M1 — Foundation** | Auth + onboarding + contas + categorias + CRUD manual + dashboard (KPIs + lista) | 🔨 em dev |
| **M2 — Smart Capture** | Parser Groq + Telegram (texto + áudio Whisper) + auto-categorização | ⏳ |
| **M3 — Insights** | Gráficos (pizza + linha) + chat conversacional com tool-calling + drill-down | ⏳ |
| **M4 — Alertas** | Motor de regras + cron diário + notificação Telegram | ⏳ |

## Quick start

```bash
# 1. Instale deps
npm install

# 2. Configure env (copie e preencha)
cp .env.example .env.local

# 3. Suba Supabase local
npx supabase start
npx supabase db reset      # aplica migrations

# 4. Gere tipos TS do schema
npm run db:types

# 5. Rode o dev server
npm run dev
```

## Testes

```bash
npm run test          # unit + integration (Vitest)
npm run test:e2e      # Playwright
npm run typecheck
npm run lint
```

## Estrutura

```
app/                  rotas (marketing, auth, onboarding, /app authenticated, /api)
components/           UI primitives (shadcn) + blocos compartilhados
lib/
  supabase/           clients (server, browser, admin)
  parser/             parseTransaction + prompts Groq (M2)
  telegram/           client + handlers (M2)
  chat/               tools + router (M3)
  alerts/             rules + evaluator (M4)
  money.ts            helpers BRL
  time.ts             helpers pt-br / timezone SP
supabase/migrations/  SQL schema + RLS + seed
tests/                unit, integration, e2e
```

## Documentação do projeto

A metodologia SDD (Spec-Driven Development) vive em `.claude/sdd/`:

- [BRAINSTORM_CAIXA_FORTE.md](.claude/sdd/features/BRAINSTORM_CAIXA_FORTE.md) — exploração e trade-offs
- [DEFINE_CAIXA_FORTE.md](.claude/sdd/features/DEFINE_CAIXA_FORTE.md) — requirements + acceptance tests + suite pt-br
- [DESIGN_CAIXA_FORTE.md](.claude/sdd/features/DESIGN_CAIXA_FORTE.md) — arquitetura + ADRs + file manifest
- [BUILD_REPORT_CAIXA_FORTE.md](.claude/sdd/reports/BUILD_REPORT_CAIXA_FORTE.md) — relatório de implementação

## Licença

MIT — veja [LICENSE](LICENSE).
