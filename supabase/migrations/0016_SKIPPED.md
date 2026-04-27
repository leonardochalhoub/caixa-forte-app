# Migration 0016 — SKIPPED

A numeração de migrations pula de `0015_fgts_type.sql` direto pra
`0017_profile_location_role.sql`. Isso **NÃO é um bug**.

## Histórico

A migration 0016 foi rascunhada durante desenvolvimento mas nunca
finalizada. Quando a próxima feature entrou (`profile_location_role`),
preferiu-se manter a numeração contígua (`0017`) ao invés de renumerar
e quebrar histórico de tracking.

## O que fazer

- **NÃO** crie um arquivo `0016_*.sql` retroativo. A numeração é só
  ordenação local; gap não afeta apply.
- **NÃO** renumere migrações posteriores. O `_applied_migrations` em
  prod já tem os números atuais; renumerar quebra o tracking.
- **Crie próximas migrations a partir de 0050+ normalmente.**

## Lição aprendida

Quando rascunhar migration mas decidir não shippá-la, delete o arquivo
local antes do próximo número entrar. Não deixe holes.
