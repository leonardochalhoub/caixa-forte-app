-- Caixa Forte — Schema inicial
-- Cria todas as tabelas de domínio. RLS habilitada mas policies em 0002.

create extension if not exists "pgcrypto";

-- =============================================================
-- profiles
-- =============================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  telegram_chat_id bigint unique,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.profiles is 'Perfil público do usuário, 1:1 com auth.users.';
comment on column public.profiles.telegram_chat_id is 'chat_id vinculado via fluxo de token; único por user.';

-- =============================================================
-- accounts (contas: Nubank, Itaú, Dinheiro, Carteira)
-- =============================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('checking', 'credit', 'cash', 'wallet')),
  color_hex text check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index accounts_user_id_idx on public.accounts (user_id);

-- =============================================================
-- categories (hierárquicas: parent_id self-ref)
-- =============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  icon text,
  color_hex text check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 0,
  is_income boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, parent_id, name)
);

create index categories_user_id_idx on public.categories (user_id);
create index categories_parent_id_idx on public.categories (parent_id);

-- =============================================================
-- transactions
-- =============================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  merchant text check (char_length(merchant) <= 200),
  note text check (char_length(note) <= 1000),
  source text not null check (source in ('web', 'telegram_text', 'telegram_voice', 'manual')),
  raw_input text,
  groq_parse_json jsonb,
  groq_confidence numeric(3,2) check (groq_confidence is null or (groq_confidence >= 0 and groq_confidence <= 1)),
  needs_review boolean generated always as (coalesce(groq_confidence < 0.70, false)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_date_idx on public.transactions (user_id, category_id, occurred_on desc);
create index transactions_user_account_idx on public.transactions (user_id, account_id);
create index transactions_needs_review_idx on public.transactions (user_id) where needs_review;

-- =============================================================
-- conversations + messages (chat — M3)
-- =============================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web', 'telegram')),
  title text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index conversations_user_idx on public.conversations (user_id, started_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_calls_json jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- =============================================================
-- alerts + alert_events (M4)
-- =============================================================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rule_json jsonb not null,
  enabled boolean not null default true,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index alerts_user_enabled_idx on public.alerts (user_id) where enabled;

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  snapshot_json jsonb,
  acknowledged_at timestamptz
);

create index alert_events_user_idx on public.alert_events (user_id, triggered_at desc);
create index alert_events_alert_idx on public.alert_events (alert_id);

-- =============================================================
-- telegram_link_tokens (vínculo seguro do chat_id, M2)
-- =============================================================
create table if not exists public.telegram_link_tokens (
  token text primary key check (char_length(token) = 8),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index telegram_link_tokens_user_idx on public.telegram_link_tokens (user_id);
create index telegram_link_tokens_expires_idx on public.telegram_link_tokens (expires_at);

-- =============================================================
-- RLS enable (policies em 0002)
-- =============================================================
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.telegram_link_tokens enable row level security;
