-- Caixa Forte — habilita Supabase Realtime em transactions
-- Permite o front se inscrever em INSERT/UPDATE/DELETE da tabela
-- (filtrado por user_id via RLS) pra atualizar dashboard sem polling.
-- Útil quando o webhook do Telegram insere uma tx e o user está
-- olhando a home: a tx aparece na hora.

alter publication supabase_realtime add table public.transactions;

comment on column public.transactions.id is
  'Realtime habilitado: mudanças propagam via supabase.channel(...).on(postgres_changes, ...). RLS aplica filtro por user_id automaticamente.';
