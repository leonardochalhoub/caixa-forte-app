-- Caixa Forte — idempotência do webhook do Telegram
-- Cada update do Telegram tem um update_id único e monotônico. Antes de
-- processar, gravamos o update_id aqui com ON CONFLICT DO NOTHING — se
-- já existe, é retry/duplicata e o webhook bail-out sem criar tx duplicada.

create table if not exists public.telegram_processed_updates (
  update_id bigint primary key,
  chat_id bigint not null,
  user_id uuid references auth.users(id) on delete cascade,
  processed_at timestamptz not null default now()
);

create index if not exists telegram_processed_updates_processed_at_idx
  on public.telegram_processed_updates (processed_at desc);

-- RLS habilitada sem policies; apenas o service-role do webhook escreve aqui.
alter table public.telegram_processed_updates enable row level security;

comment on table public.telegram_processed_updates is
  'Log de update_ids do Telegram já processados; chave de idempotência do webhook.';
