-- Caixa Forte — is_settled como boolean canônico
-- paid_at hoje significa três coisas: NULL=futuro/agendado;
-- timestamp-derived=settled (backfill 0025); timestamp explícito=
-- pagamento real. Separar a semântica:
--   - paid_at:    quando o dinheiro saiu / entrou (timestamp real)
--   - is_settled: flag boolean canônica "essa tx conta no saldo".
--
-- Por enquanto is_settled é GENERATED STORED a partir de paid_at
-- (true sse paid_at não-null). Isso adiciona queryability sem mudar
-- nenhum comportamento. Numa passada futura, app pode mudar pra
-- usar is_settled diretamente nas queries (mais legível) e em algum
-- momento paid_at pode ficar opcional pra tx settled (caso queiramos
-- aceitar settled sem timestamp preciso).

alter table public.transactions
  add column if not exists is_settled boolean
    generated always as (paid_at is not null) stored;

create index if not exists transactions_user_settled_idx
  on public.transactions (user_id, is_settled, occurred_on desc);

comment on column public.transactions.is_settled is
  'Flag boolean canônica: true sse a tx já foi liquidada (entra em saldo). Hoje derivado de paid_at; pode virar coluna independente no futuro.';
