-- Profile birthday (date). Optional for legacy accounts; new signups can add
-- via /app/profile after login.
alter table public.profiles
  add column if not exists birthday date;

create index if not exists profiles_birthday_idx on public.profiles (birthday);

comment on column public.profiles.birthday is 'Self-reported birthday. Used only by the owner for demographics in /app/sysadmin aggregates.';
