# ADR 0006 — Balance Snapshots Diários

**Status**: Aceito · 2026-04 (Conselho v2 → implementado v3)

## Contexto

Gráfico de "evolução do patrimônio" pode ser construído de dois jeitos:

1. **Replay sobre o estado atual** — itera transações ordenadas por data
   e reconstrói saldo dia a dia. Simples, não precisa nova tabela.
2. **Snapshots diários** — guarda foto do saldo no fim de cada dia.

Replay tem 2 problemas conhecidos:
- **Delete/edit em row passada quebra o histórico**: se o user apaga uma
  tx de janeiro, o "saldo de janeiro" reconstruído hoje está errado.
- **Custo computacional cresce com volume**: cada render do gráfico itera
  todas as txs.

## Decisão

Adotamos **snapshots diários** via tabela `balance_snapshots` populada
por cron + funções SQL.

### Schema (mig 0051)

```sql
balance_snapshots (
  id uuid pk,
  user_id uuid fk auth.users,
  snapshot_date date,
  total_balance_cents bigint,
  per_account jsonb,           -- {account_id: cents}
  per_account_type jsonb,      -- {checking: c, credit: c, ...}
  created_at timestamptz,
  unique (user_id, snapshot_date)
)
```

### Cron

`/api/cron/balance-snapshot` agendado em vercel.json pra 04:00 UTC.
Idempotente via UPSERT em `(user_id, snapshot_date)`.

### Functions SQL (mig 0053)

- `compute_per_account_balance(user_id) → jsonb` — saldo por conta
- `compute_per_account_type(user_id, per_account) → jsonb` — agrega por tipo

Centraliza a lógica de cálculo. Cron chama via `supabase.rpc()`.

## per_account como jsonb (decisão de modelagem)

Optamos por jsonb em vez de tabela normalizada `balance_snapshot_items`.

**Por que funciona**: snapshots são lidos em bloco (`WHERE user_id=X
ORDER BY snapshot_date LIMIT 90`). Nunca filtra por valor interno.
Custo de join numa tabela normalizada (N rows × M dias) supera o
benefício.

**Trade-off conhecido**: account_id dentro do jsonb não tem FK. Se conta
for deletada, snapshot histórico continua referenciando ID que não
existe mais. **Isso é semanticamente correto** pra trends históricos
(o saldo existia naquele dia), mas qualquer JOIN futuro vai precisar
de LEFT JOIN tolerante.

## Consequências

### Vantagens

- **Trends honestos**: delete/edit em rows passadas não retroflete no
  histórico. Snapshot de janeiro é janeiro, não "como veria janeiro
  hoje".
- **Performance constante**: render do gráfico é O(N dias), não O(N tx).
- **Backfill possível**: function `compute_per_account_balance` permite
  recalcular qualquer dia (mig 0053 fez isso pra hoje em todos os users).

### Desvantagens

- **Tabela cresce**: 1 row por user por dia. 1000 users × 365 dias = 365k
  rows/ano. Aceitável.
- **Cron pode falhar**: gap de 1+ dias se cron quebrar. Mitigação: cron
  é idempotente (UPSERT) — re-rodando preenche; e UI mostra estado
  "sem snapshots" sem quebrar.

## Referências

- `supabase/migrations/0051_balance_snapshots.sql` (tabela + RLS)
- `supabase/migrations/0053_balance_snapshot_baseline.sql` (functions + backfill)
- `app/api/cron/balance-snapshot/route.ts` (cron)
- `app/app/_components/PatrimonyTrend.tsx` (UI consumindo)
- `lib/dashboard/queries.ts:fetchPatrimonySnapshots` (query)
