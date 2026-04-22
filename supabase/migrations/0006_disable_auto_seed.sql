-- Caixa Forte — desabilita seed automático de categorias no signup.
-- O onboarding agora gera categorias personalizadas via Groq (lib/categories/generator.ts)
-- baseado na auto-descrição do usuário. A função seed_default_categories() é mantida
-- como fallback caso a geração falhe ou GROQ_API_KEY não esteja configurada.

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
  -- Categorias NÃO são mais semeadas aqui; onboarding faz via Groq ou chama seed_default_categories como fallback.
  return new;
end;
$$;

comment on function public.handle_new_user is 'Cria profile no signup. Categorias são geradas no fluxo de onboarding (Groq + descrição do user).';
