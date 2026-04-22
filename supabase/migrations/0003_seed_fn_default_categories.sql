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
