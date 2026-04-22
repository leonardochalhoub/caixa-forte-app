-- Persist the user's city coordinates so the sysadmin map can pin them
-- precisely without relying on a curated city table that inevitably
-- misses smaller municipalities. lat/lng are geocoded server-side on
-- save via Open-Meteo's free geocoding API.
alter table public.profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision;
