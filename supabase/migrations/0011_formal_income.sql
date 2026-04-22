-- Caixa Forte — flag "entrada formal" em categories.
-- Só transações em categorias com is_formal_income=true entram nos KPIs mensais de
-- "Entrada do mês" e "Saldo do mês". Saldos iniciais, ajustes de saldo e reembolsos
-- afetam o saldo total atual, mas ficam fora do fluxo mensal.

alter table public.categories
  add column if not exists is_formal_income boolean not null default false;

comment on column public.categories.is_formal_income is
  'Quando true, transações de income nesta categoria contam em "Entrada do mês" dos KPIs. Default false mantém saldos iniciais, ajustes etc. fora do fluxo mensal.';

-- Mark default "formal" categories for existing users
update public.categories
set is_formal_income = true
where is_income = true
  and lower(name) in ('salário', 'extra', 'investimentos');

-- Update seed_default_categories to mark future users the same
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

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Mercado', false, 1)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Supermercado', false, 1),
    (p_user, v_parent, 'Hortifruti', false, 2),
    (p_user, v_parent, 'Padaria', false, 3);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Transporte', false, 2)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Combustível', false, 1),
    (p_user, v_parent, 'App', false, 2),
    (p_user, v_parent, 'Transporte Público', false, 3),
    (p_user, v_parent, 'Manutenção', false, 4);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Restaurantes', false, 3)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Delivery', false, 1),
    (p_user, v_parent, 'Bar/Café', false, 2),
    (p_user, v_parent, 'Restaurante', false, 3);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Contas Fixas', false, 4)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Moradia', false, 1),
    (p_user, v_parent, 'Energia', false, 2),
    (p_user, v_parent, 'Água', false, 3),
    (p_user, v_parent, 'Internet', false, 4),
    (p_user, v_parent, 'Telefone', false, 5);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Saúde', false, 5)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Farmácia', false, 1),
    (p_user, v_parent, 'Plano', false, 2),
    (p_user, v_parent, 'Consulta', false, 3),
    (p_user, v_parent, 'Academia', false, 4);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Lazer', false, 6)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Cinema', false, 1),
    (p_user, v_parent, 'Viagem', false, 2),
    (p_user, v_parent, 'Jogos', false, 3),
    (p_user, v_parent, 'Eventos', false, 4);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Educação', false, 7)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Cursos', false, 1),
    (p_user, v_parent, 'Livros', false, 2),
    (p_user, v_parent, 'Mensalidade', false, 3);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Assinaturas', false, 8)
    returning id into v_parent;
  insert into public.categories (user_id, parent_id, name, is_income, sort_order) values
    (p_user, v_parent, 'Streaming', false, 1),
    (p_user, v_parent, 'Software', false, 2),
    (p_user, v_parent, 'Outras', false, 3);

  -- Renda pai: is_income=true mas NÃO formal (usado pra saldos iniciais/ajustes)
  insert into public.categories (user_id, name, is_income, is_formal_income, sort_order)
    values (p_user, 'Renda', true, false, 9)
    returning id into v_parent;
  -- Salário, Extra, Investimentos são formal. Reembolso não.
  insert into public.categories (user_id, parent_id, name, is_income, is_formal_income, sort_order) values
    (p_user, v_parent, 'Salário', true, true, 1),
    (p_user, v_parent, 'Extra', true, true, 2),
    (p_user, v_parent, 'Investimentos', true, true, 3),
    (p_user, v_parent, 'Reembolso', true, false, 4);

  insert into public.categories (user_id, name, is_income, sort_order) values (p_user, 'Outros', false, 10);
end;
$$;
