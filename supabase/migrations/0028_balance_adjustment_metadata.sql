-- Metadata JSONB pra linhas do Balanço — permite carregar valores
-- de fontes externas (FIPE pra carros, cotação pra cripto, etc.)
-- Exemplo: {"source": "fipe", "fipe_code": "025266-2",
--          "brand_id": 26, "model_id": 4828, "year_id": "2021-1"}

alter table public.balance_adjustments
  add column if not exists metadata jsonb;

create index if not exists balance_adjustments_metadata_source_idx
  on public.balance_adjustments ((metadata->>'source'))
  where metadata->>'source' is not null;

comment on column public.balance_adjustments.metadata is
  'Metadata opcional pra automações. Ex: source=fipe + resolved IDs permite cron atualizar o valor mensalmente.';
