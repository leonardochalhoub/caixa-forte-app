-- Caixa Forte — log de toda entrada livre do usuário (texto ou voz).
-- Cada mensagem de captura vira uma linha aqui, independente de virar ou não transação.

create table if not exists public.capture_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in (
    'web_text', 'web_voice', 'telegram_text', 'telegram_voice'
  )),
  raw_input text not null,
  transcription text,
  groq_parse_json jsonb,
  groq_confidence numeric(3,2) check (
    groq_confidence is null or (groq_confidence >= 0 and groq_confidence <= 1)
  ),
  transaction_id uuid references public.transactions(id) on delete set null,
  error text,
  metadata jsonb,
  duration_ms int,
  model text,
  created_at timestamptz not null default now()
);

create index capture_messages_user_created_idx
  on public.capture_messages (user_id, created_at desc);
create index capture_messages_transaction_idx
  on public.capture_messages (transaction_id)
  where transaction_id is not null;

alter table public.capture_messages enable row level security;

create policy "capture_messages_select_own" on public.capture_messages
  for select using (user_id = auth.uid());
create policy "capture_messages_insert_own" on public.capture_messages
  for insert with check (user_id = auth.uid());
create policy "capture_messages_update_own" on public.capture_messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "capture_messages_delete_own" on public.capture_messages
  for delete using (user_id = auth.uid());

comment on table public.capture_messages is
  'Audit log: toda entrada livre (texto ou voz) via web/telegram. Uma linha por tentativa, transação opcionalmente vinculada.';
