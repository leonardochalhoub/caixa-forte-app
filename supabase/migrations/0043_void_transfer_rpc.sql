-- Caixa Forte — RPC pra desfazer um par transfer
-- Apaga ambos os lados de uma transferência via transfer_peer_id
-- numa única transação. Útil quando o user quer desfazer um
-- pagamento de fatura (ou qualquer transfer) sem perigar deixar
-- um lado órfão.

create or replace function public.void_transfer(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_peer_id uuid;
  v_owner uuid;
  v_deleted_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'auth.uid() é null — chamada precisa de sessão autenticada';
  end if;

  select user_id, transfer_peer_id
    into v_owner, v_peer_id
  from public.transactions
  where id = p_tx_id;

  if v_owner is null then
    raise exception 'Transação não encontrada';
  end if;
  if v_owner <> v_user_id then
    raise exception 'Transação não pertence ao usuário';
  end if;

  -- Apaga primeiro o peer (se existir) pra evitar FK on_delete=set_null
  -- atualizar peer_id da própria tx em curso. Se peer não existe, OK —
  -- apaga só a tx (transfer órfão).
  if v_peer_id is not null then
    delete from public.transactions
    where id = v_peer_id and user_id = v_user_id;
  end if;

  delete from public.transactions
  where id = p_tx_id and user_id = v_user_id;

  v_deleted_ids := array_remove(array[p_tx_id, v_peer_id], null);

  return jsonb_build_object(
    'deleted_ids', v_deleted_ids,
    'orphan', v_peer_id is null
  );
end;
$$;

comment on function public.void_transfer is
  'Desfaz uma transferência apagando os 2 lados via transfer_peer_id. Atômico. Se o peer não existe (órfão), apaga só a tx pedida.';
