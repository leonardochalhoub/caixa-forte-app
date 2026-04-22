-- Full IBGE municipality catalog with coordinates. Seeded once from the
-- public kelvins/municipios-brasileiros dataset. Used by the CityPicker
-- to avoid hammering Open-Meteo on every signup and by the sysadmin map
-- for rock-solid pin placement.
create table if not exists public.cities_br (
  ibge_id bigint primary key,
  name text not null,
  uf char(2) not null,
  lat double precision,
  lng double precision,
  capital boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists cities_br_uf_idx on public.cities_br (uf);
create index if not exists cities_br_name_idx on public.cities_br (lower(name));

-- Publicly readable so the signup form can look up coords client-side
-- later if we ever wire that path. RLS enabled with a permissive SELECT
-- so anon users can query names + coords for picker UX.
alter table public.cities_br enable row level security;

drop policy if exists "cities_br_public_read" on public.cities_br;
create policy "cities_br_public_read"
  on public.cities_br for select
  using (true);
