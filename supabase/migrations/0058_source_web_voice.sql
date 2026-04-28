-- Caixa Forte — adiciona 'web_voice' ao CHECK transactions.source
-- User reportou: ao resolver uma captura pendente escolhendo Conta,
-- aparece "an error occurred server components..." (mensagem genérica
-- de erro de Server Component do Next).
--
-- Causa: app/app/actions/captures.ts:128 fazia `source: cap.channel`,
-- onde channel pode ser 'web_text' | 'web_voice' | 'telegram_text' |
-- 'telegram_voice'. Mas o CHECK constraint só permite
-- ('web', 'telegram_text', 'telegram_voice', 'manual') — 'web_text'
-- e 'web_voice' viravam violation silenciosa.
--
-- Fix em 2 partes:
--   1. Schema: expandir CHECK pra aceitar 'web_voice' (separável de
--      'web' pra rastreabilidade — origem de voz vs texto importa pra
--      analytics futuras).
--   2. Code: passar cap.channel por channelToSource() em vez de direto.
--
-- 'web_text' continua mapeando pra 'web' (mantém compat com as 846 rows
-- históricas já com source='web').

alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
    check (source = any (array[
      'web'::text,
      'web_voice'::text,
      'telegram_text'::text,
      'telegram_voice'::text,
      'manual'::text
    ]));

comment on constraint transactions_source_check on public.transactions is
  'Origem da tx. web=captura via web (texto inclusive — legado), web_voice=microfone na web, telegram_text/voice=bot, manual=criada via UI form.';
