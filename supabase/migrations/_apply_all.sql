-- Caixa Forte — todas as migrations concatenadas para rodar no SQL Editor
-- Cole este arquivo inteiro em https://supabase.com/dashboard/project/tzsbdzaikcgxoploufpu/sql

-- ==============================================================
-- supabase/migrations/0001_init_schema.sql
-- ==============================================================
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

-- ==============================================================
-- supabase/migrations/0002_rls_policies.sql
-- ==============================================================
-- Caixa Forte — RLS policies
-- Cada tabela com user_id tem 4 policies: select / insert / update / delete.
-- Auth.uid() retorna o id do user autenticado via JWT.

-- =============================================================
-- profiles
-- =============================================================
create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles não tem delete (cascade do auth.users cuida)

-- =============================================================
-- accounts
-- =============================================================
create policy "accounts_select_own" on public.accounts
  for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts
  for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "accounts_delete_own" on public.accounts
  for delete using (user_id = auth.uid());

-- =============================================================
-- categories
-- =============================================================
create policy "categories_select_own" on public.categories
  for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete_own" on public.categories
  for delete using (user_id = auth.uid());

-- =============================================================
-- transactions
-- =============================================================
create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid());
create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions_delete_own" on public.transactions
  for delete using (user_id = auth.uid());

-- =============================================================
-- conversations + messages
-- =============================================================
create policy "conversations_select_own" on public.conversations
  for select using (user_id = auth.uid());
create policy "conversations_insert_own" on public.conversations
  for insert with check (user_id = auth.uid());
create policy "conversations_update_own" on public.conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversations_delete_own" on public.conversations
  for delete using (user_id = auth.uid());

-- messages: sem user_id direto; herda via conversation_id
create policy "messages_select_own" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "messages_insert_own" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
-- messages update/delete: só via cascade ou admin

-- =============================================================
-- alerts + alert_events
-- =============================================================
create policy "alerts_select_own" on public.alerts
  for select using (user_id = auth.uid());
create policy "alerts_insert_own" on public.alerts
  for insert with check (user_id = auth.uid());
create policy "alerts_update_own" on public.alerts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alerts_delete_own" on public.alerts
  for delete using (user_id = auth.uid());

create policy "alert_events_select_own" on public.alert_events
  for select using (user_id = auth.uid());
create policy "alert_events_update_own" on public.alert_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- alert_events insert/delete feitos só pelo service role (cron)

-- =============================================================
-- telegram_link_tokens
-- =============================================================
create policy "telegram_link_tokens_select_own" on public.telegram_link_tokens
  for select using (user_id = auth.uid());
create policy "telegram_link_tokens_insert_own" on public.telegram_link_tokens
  for insert with check (user_id = auth.uid());
create policy "telegram_link_tokens_delete_own" on public.telegram_link_tokens
  for delete using (user_id = auth.uid());

-- ==============================================================
-- supabase/migrations/0003_seed_fn_default_categories.sql
-- ==============================================================
-- Caixa Forte — função que semeia categorias padrão BR para um user.
-- Chamada no trigger de signup (0005) e pode ser re-executada via RPC se user arquivar tudo.

create or replace function public.seed_default_categories(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
begin
  if exists (select 1 from public.categories where user_id = p_user) then
    return;
  end if;

  -- 1. Mercado
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Mercado', false, 1)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Supermercado', false, 1),
    (p_user, v_parent, 'Hortifruti', false, 2),
    (p_user, v_parent, 'Padaria', false, 3);

  -- 2. Transporte
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Transporte', false, 2)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Combustível', false, 1),
    (p_user, v_parent, 'App', false, 2),
    (p_user, v_parent, 'Transporte Público', false, 3),
    (p_user, v_parent, 'Manutenção', false, 4);

  -- 3. Restaurantes
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Restaurantes', false, 3)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Delivery', false, 1),
    (p_user, v_parent, 'Bar/Café', false, 2),
    (p_user, v_parent, 'Restaurante', false, 3);

  -- 4. Contas Fixas
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Contas Fixas', false, 4)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Moradia', false, 1),
    (p_user, v_parent, 'Energia', false, 2),
    (p_user, v_parent, 'Água', false, 3),
    (p_user, v_parent, 'Internet', false, 4),
    (p_user, v_parent, 'Telefone', false, 5);

  -- 5. Saúde
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Saúde', false, 5)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Farmácia', false, 1),
    (p_user, v_parent, 'Plano', false, 2),
    (p_user, v_parent, 'Consulta', false, 3),
    (p_user, v_parent, 'Academia', false, 4);

  -- 6. Lazer
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Lazer', false, 6)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Cinema', false, 1),
    (p_user, v_parent, 'Viagem', false, 2),
    (p_user, v_parent, 'Jogos', false, 3),
    (p_user, v_parent, 'Eventos', false, 4);

  -- 7. Educação
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Educação', false, 7)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Cursos', false, 1),
    (p_user, v_parent, 'Livros', false, 2),
    (p_user, v_parent, 'Mensalidade', false, 3);

  -- 8. Assinaturas
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Assinaturas', false, 8)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Streaming', false, 1),
    (p_user, v_parent, 'Software', false, 2),
    (p_user, v_parent, 'Outras', false, 3);

  -- 9. Renda (única categoria de entrada)
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Renda', true, 9)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Salário', true, 1),
    (p_user, v_parent, 'Extra', true, 2),
    (p_user, v_parent, 'Investimentos', true, 3),
    (p_user, v_parent, 'Reembolso', true, 4);

  -- 10. Outros (catch-all)
  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Outros', false, 10);
end;
$$;

comment on function public.seed_default_categories is 'Cria as 10 categorias pai + subcategorias padrão BR para um user, se ainda não houver.';

-- ==============================================================
-- supabase/migrations/0004_triggers_updated_at.sql
-- ==============================================================
-- Caixa Forte — triggers de updated_at.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger trg_alerts_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

-- ==============================================================
-- supabase/migrations/0005_profile_on_signup.sql
-- ==============================================================
-- Caixa Forte — trigger no signup: cria profile + semeia categorias padrão.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;

  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user is 'Cria profile e seed de categorias quando um user se registra via Auth.';

