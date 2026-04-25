-- Caixa Forte — rastreio de migrations aplicadas
-- Antes desse arquivo, migrations eram aplicadas manualmente sem registro.
-- Resultado: 0026 ficou pra trás sem ninguém perceber até quebrar a UI.
-- Agora cada arquivo .sql aplicado vai gravar uma linha aqui; o script
-- scripts/apply-pending.mjs faz reconciliação e aplica só o que falta.

create table if not exists public._applied_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

comment on table public._applied_migrations is
  'Log de migrations já aplicadas; usado por scripts/apply-pending.mjs.';

alter table public._applied_migrations enable row level security;
-- Sem policies: leitura/escrita só via service role (Management API).

-- Backfill: tudo de 0001 a 0033 marca como aplicado. Verificado via
-- information_schema que as colunas/tabelas críticas dessas migrations
-- existem em prod. Se uma delas faltar, é só rodar apply-pending de
-- novo depois de remover a linha aqui.
insert into public._applied_migrations (filename) values
  ('0001_init_schema.sql'),
  ('0002_rls_policies.sql'),
  ('0003_seed_fn_default_categories.sql'),
  ('0004_triggers_updated_at.sql'),
  ('0005_profile_on_signup.sql'),
  ('0006_disable_auto_seed.sql'),
  ('0007_capture_messages.sql'),
  ('0008_opening_balance.sql'),
  ('0009_savings_account_type.sql'),
  ('0010_investment_account_type.sql'),
  ('0011_formal_income.sql'),
  ('0012_transfer_flag.sql'),
  ('0013_poupanca_type.sql'),
  ('0014_crypto_type.sql'),
  ('0015_fgts_type.sql'),
  ('0017_profile_location_role.sql'),
  ('0018_login_events.sql'),
  ('0019_profile_gender.sql'),
  ('0020_profile_birthday.sql'),
  ('0021_profile_coords.sql'),
  ('0022_cities_br.sql'),
  ('0023_doc_clicks.sql'),
  ('0024_soft_delete_account.sql'),
  ('0025_transaction_paid_at.sql'),
  ('0026_credit_card_closing_day.sql'),
  ('0027_balance_sheet_adjustments.sql'),
  ('0028_balance_adjustment_metadata.sql'),
  ('0029_account_balance_classification.sql'),
  ('0030_balance_registries.sql'),
  ('0031_demo_user_and_clicks.sql'),
  ('0032_telegram_idempotency.sql'),
  ('0033_migration_tracking.sql')
on conflict (filename) do nothing;
