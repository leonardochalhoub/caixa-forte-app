-- Profile role + IBGE location fields.
-- role: 'user' (default) | 'admin' | 'owner'.
--   owner = full control, can grant/revoke admin (exactly one per project).
--   admin = can view sysadmin dashboard.
--   user  = default.
-- city_ibge: IBGE municipality code (6 or 7 digits, bigint).
-- city_name + uf: denormalized for display/filter (IBGE names + 2-char UF).

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin', 'owner')),
  add column if not exists city_ibge bigint,
  add column if not exists city_name text,
  add column if not exists uf text
    check (uf is null or char_length(uf) = 2);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_uf_idx on public.profiles (uf);

-- Bootstrap: promote the first expected owner email. Idempotent.
-- Replace the email below to change who the initial owner is.
update public.profiles
  set role = 'owner'
  where user_id in (
    select id from auth.users
    where lower(email) = 'leochalhoub@hotmail.com'
  );

comment on column public.profiles.role is 'user | admin | owner. owner can grant/revoke admin; admin can view /app/sysadmin.';
comment on column public.profiles.city_ibge is 'IBGE municipality code, used by CityPicker.';
