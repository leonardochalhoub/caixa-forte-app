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
