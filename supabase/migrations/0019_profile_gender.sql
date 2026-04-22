-- Profile gender field — 'M' | 'F' (or NULL for existing/legacy rows).
-- Required on new signups going forward.
alter table public.profiles
  add column if not exists gender text
    check (gender is null or gender in ('M', 'F'));

create index if not exists profiles_gender_idx on public.profiles (gender);

comment on column public.profiles.gender is 'Self-reported gender: M/F. Required at signup; nullable for older accounts until they update their profile.';
