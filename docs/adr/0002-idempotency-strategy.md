# ADR 0002 — Estratégia de Idempotência

**Status**: Aceito · 2026-04 (Conselho v1)

## Contexto

Operações sensíveis a duplo-clique no app:
- **Telegram capture**: webhook pode receber mesmo `update_id` 2× (retry
  do servidor Telegram).
- **Pagamento de fatura** (`pay_invoice` RPC): user clica "Pagar" 2×
  rapidamente, ou rede atrasa e cliente reenvia.

Sem proteção, criamos pares duplicados de transações.

## Decisão

Adotamos 3 camadas de proteção, cada uma com escopo claro:

### Camada 1 — Dedup por update_id (Telegram)

Tabela `telegram_processed_updates(update_id PRIMARY KEY)`. INSERT do
update_id no início do webhook; ON CONFLICT 23505 → bail-out cedo.

**Arquivo**: `app/api/telegram/webhook/[secret]/route.ts:57-71`

### Camada 2 — Idempotency key determinística (pay_invoice)

Coluna `transactions.idempotency_key uuid` + UNIQUE PARTIAL INDEX
`(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

Cliente gera SHA1(user_id::card_id::invoice_label) em
`app/app/cartoes/actions.ts:11-18`. RPC `pay_invoice` faz lookup
antes de inserir; se par já existe pra mesma key, retorna existente
com `idempotent_replay=true`.

**Arquivo**: `supabase/migrations/0048_invoice_idempotency.sql`

### Camada 3 — Janela temporal (capture pipeline)

Pra qualquer captura, defesa secundária: se nos últimos 90s já
existe tx com `(user, account, type, amount_cents)` igual, trata
como duplicata silenciosamente. Cobre casos onde o LLM parseia data
ou merchant ligeiramente diferentes pelo retry, mas semanticamente
é a mesma transação.

**Arquivo**: `lib/capture/pipeline.ts:247-280`

## Consequências

### Vantagens

- Cobertura defense-in-depth: cada camada cobre um vetor diferente.
- Idempotency key determinística (vs random UUID) faz "mesma operação
  semântica → mesma key", não só "mesmo request".
- Janela 90s é curta o bastante pra falsos-positivos serem improváveis
  (duas tx legítimas idênticas em <90s é raro na vida real pessoal).

### Desvantagens

- 3 camadas = 3 lugares pra debugar quando algo aparenta dedup errado.
- Idempotency key SHA1 não-rotativo: se usuário renomear cartão entre
  cliques, key muda e replay falha em criar duplicata "intencional".
  Aceito — caso degenerado.

## Referências

- `supabase/migrations/0032_telegram_dedup.sql` (camada 1)
- `supabase/migrations/0041_tx_invariant_triggers.sql:8-29` (trigger
  prevent_near_duplicate_tx)
- `supabase/migrations/0048_invoice_idempotency.sql` (camada 2)
- `lib/capture/pipeline.ts:247-280` (camada 3)
