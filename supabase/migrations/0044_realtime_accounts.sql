-- Caixa Forte — habilita Supabase Realtime em accounts
-- Permite o front se inscrever em INSERT/UPDATE/DELETE de accounts
-- (filtrado por user_id via RLS) pra atualizar dashboard sem polling
-- quando o user altera saldo/abre/fecha conta numa aba e outras
-- abas precisam refletir.

alter publication supabase_realtime add table public.accounts;
