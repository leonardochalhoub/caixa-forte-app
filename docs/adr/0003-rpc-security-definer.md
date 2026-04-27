# ADR 0003 — RPCs com SECURITY DEFINER

**Status**: Aceito · 2026-04 (revisado pós-Conselho v2)

## Contexto

Operações multi-row atômicas (pagamento de fatura, void de transfer)
precisam executar 4-6 escritas em uma transação. Fazer isso via cliente
Supabase é frágil: falha entre passos deixa ledger corrompido.

Opções avaliadas:
1. **Edge Function** (Deno) com try/catch + transação manual via SQL.
2. **PL/pgSQL function com `SECURITY DEFINER`**.
3. **Server Action no Next.js** com 4 awaits sequenciais.

## Decisão

**Opção 2** — PL/pgSQL `SECURITY DEFINER` com `set search_path=public`.
Toda lógica multi-write atômica fica em RPCs:

- `pay_invoice` (0035 → 0048 → 0049) — pagamento de fatura idempotente
- `void_transfer` (0043) — desfaz par de transferência
- `seed_default_categories` — seed inicial de user
- `handle_new_user` — trigger pós-signup

## Hardening obrigatório (0050)

Conselho v2 (supabase-specialist) flagou risco de execute default
`PUBLIC` em SECURITY DEFINER. Padrão agora:

```sql
revoke execute on function public.<fn>(args) from public;
grant execute on function public.<fn>(args) to authenticated;
```

Aplicado em `pay_invoice` em `0050_council_v2_hardening.sql`.

## Consequências

### Vantagens

- **Atomicidade real**: PL/pgSQL function é uma transação implícita;
  qualquer EXCEPTION rolls back tudo.
- **Performance**: zero round-trips do cliente; 1 RPC = N escritas no
  servidor.
- **`auth.uid()` disponível**: RPC valida ownership sem precisar passar
  user_id como parâmetro.
- **`set search_path=public`** blinda contra search_path hijack
  (vetor clássico de privilege escalation em SECURITY DEFINER).

### Desvantagens

- Lógica em SQL/PLpgSQL é menos testável que TS. Mitigação: testes de
  integração via cliente Supabase chamando RPC e verificando estado.
- `SECURITY DEFINER` BYPASSA RLS internamente — cuidado pra não vazar
  dados de outros users via lookup interno. Sempre filtrar por
  `where user_id = auth.uid()`.

## Referências

- `supabase/migrations/0035_pay_invoice_atomic.sql`
- `supabase/migrations/0043_void_transfer_rpc.sql`
- `supabase/migrations/0050_council_v2_hardening.sql:23-26` (revoke/grant)
- PostgreSQL docs: <https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY>
