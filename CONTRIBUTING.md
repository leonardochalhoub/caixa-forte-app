# Contribuir com o Caixa Forte

Obrigado pelo interesse. O Caixa Forte é open-source MIT — todo código,
schema e prompt está no repo. Aceito contribuição de qualquer pessoa,
em qualquer escala (typo no README até feature nova).

## Antes de mexer

- **Leia os ADRs** em [`docs/adr/`](docs/adr/) — decisões grandes
  (cartão como conta, idempotência, RPCs SECURITY DEFINER, peer FK,
  abstração LLM, balance_snapshots) estão documentadas com o *porquê*.
- **Filosofia do produto** em [`README.md`](README.md): grátis pra
  sempre, MIT, zero monetização. Features são só pra ser **útil** —
  se complica, simplifica.
- **Ledger é soberano do usuário** ([memória](./)): nunca insira/atualize/
  delete `transactions` sem ação explícita do usuário. Captura via
  Telegram = ação do usuário (ele mandou a mensagem).

## Setup local

```bash
git clone https://github.com/leonardochalhoub/caixa-forte-app
cd caixa-forte-app
npm ci
cp .env.example .env.local  # se existir; senão crie e preencha
npm run dev
```

Você precisa de:
- Node 20+
- Supabase project próprio (free tier OK)
- (opcional) Groq API key pra captura LLM
- (opcional) Telegram bot token pra capture via app

Veja [`.env.example`](.env.example) (se existir) ou rode `npm run dev`
e siga os erros pra saber quais env vars setar.

## Fluxo de PR

1. **Fork** o repo no GitHub.
2. **Branch nova** local: `git checkout -b fix/algum-bug` ou
   `feat/recorrencias`.
3. **Edite, teste localmente:**
   ```bash
   npm run typecheck   # zero erros
   npm run lint        # zero erros
   npm test            # tests passando
   npm run build       # build limpo
   ```
4. **Commit** com mensagem descritiva em pt-BR. Padrão Conventional
   Commits (não obrigatório, mas valorizado): `feat(...)`, `fix(...)`,
   `refactor(...)`, `chore(...)`, `docs(...)`.
5. **Push + PR** pra `main`. Descreva o que mudou e por quê. Se for
   bug fix, link pro issue. Se for feature, justifique o WHY (alinha
   com filosofia "útil mas simples"?).
6. **CI roda automaticamente** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) —
   typecheck + lint + 90 unit tests. Tudo verde antes do review.

## Onde mexer com confiança

| Quero... | Onde |
|---|---|
| Adicionar feature de UI | `app/app/<rota>/` (Server Component) + `_components/` (Client) |
| Mexer no schema | `supabase/migrations/NNNN_descricao.sql` (idempotente!) |
| Adicionar lógica de negócio testável | `lib/<dominio>/helpers.ts` + `tests/unit/` |
| Mudar prompt do LLM | `lib/parser/prompt.ts` |
| Ajustar trend/charts | `app/app/_components/PatrimonyTrend.tsx`, `TrendStrip.tsx` |
| Documentar decisão grande | `docs/adr/NNNN-titulo.md` (use template existente) |

## Onde NÃO mexer sem alinhar

- **Migrations já aplicadas em prod** (ver `_applied_migrations` table) —
  crie nova migration aditiva, não edite a antiga.
- **`pay_invoice` RPC** — coração do credit card; mudança quebra ledger.
- **Triggers em `supabase/migrations/0041_*` em diante** — invariantes
  contábeis que protegem integridade.

## Filosofia de código

- **Comentários explicam *porquê*, não *o quê*.** Se você precisa
  comentar o que o código faz, ele provavelmente está pouco claro.
- **TypeScript estrito** (`noUncheckedIndexedAccess: true`). Sem `any`
  em paths críticos.
- **Server Components por default**, Client Components só quando
  precisa interatividade.
- **Idempotência em migrations + RPCs** — re-rodar não pode quebrar.
- **pt-BR em UI, mensagens, comentários, mensagens de commit.**

## Reportar bug ou sugerir feature

[Abra uma issue](https://github.com/leonardochalhoub/caixa-forte-app/issues/new)
com:
- O que aconteceu (vs o que esperava)
- Como reproduzir (passo a passo)
- Seu setup (browser, OS, mobile?)
- Se aplicável: screenshot ou texto do erro

## Convivência

Tom respeitoso. Crítica é bem-vinda quando construtiva. Não há
hierarquia — comentário de iniciante vale igual ao de senior.

Discordâncias técnicas resolvem-se com argumento, não com voto.

## Licença

Ao contribuir, você concorda que sua contribuição segue a [licença MIT](LICENSE)
do projeto.
