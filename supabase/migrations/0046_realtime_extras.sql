-- Adiciona tabelas user-scoped ao publication realtime do Supabase.
-- RLS já filtra por user_id automaticamente.
--
-- Por que: capture_messages alimenta UI "processando..." do Telegram;
-- messages é o chat M3; alert_events é a notificação do M4. Sem isso,
-- a UI precisa fazer polling pra mostrar live state.

alter publication supabase_realtime add table public.capture_messages;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.alert_events;
