<div align="center">

# Caixa Forte

### É preto no branco!

**Controle financeiro pessoal para brasileiros que querem clareza sobre o próprio dinheiro — sem planilha, sem atrito, sem assinatura.**

&nbsp;

[**🚀 Abra o app →**](https://caixa-forte-app.vercel.app/)

&nbsp;

<a href="https://caixa-forte-app.vercel.app/docs" target="_blank" rel="noopener noreferrer"><strong>📖 Documentação</strong></a> &nbsp;·&nbsp; [**Criar conta**](https://caixa-forte-app.vercel.app/signup) &nbsp;·&nbsp; [**Entrar**](https://caixa-forte-app.vercel.app/login)

&nbsp;

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=000)
![Supabase](https://img.shields.io/badge/Supabase-Postgres+Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama%203.3%20%2B%20Whisper-F55036?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-000000?style=for-the-badge)

![Open Source](https://img.shields.io/badge/open%20source-♥-ec4899)
![Zero Cost](https://img.shields.io/badge/price-R%24%200%20pra%20sempre-22c55e)
![Built for BR](https://img.shields.io/badge/built%20for-🇧🇷%20brasileiros-0ea5e9)
![LGPD](https://img.shields.io/badge/LGPD-ready-000)

[![CI](https://github.com/leonardochalhoub/caixa-forte-app/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardochalhoub/caixa-forte-app/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-90%20passing-22c55e?style=flat)
![Migrations](https://img.shields.io/badge/migrations-54%20applied-3ECF8E?style=flat)
![ADRs](https://img.shields.io/badge/ADRs-6-000?style=flat)

</div>

---

## 🧭 Por que isso existe

A maioria dos brasileiros ainda controla dinheiro em planilha de 2015 ou num caderno. Quem tenta aplicativo esbarra em três problemas:

- **Assinatura cara.** Premium, Plus, Pro — e na real o básico é bloqueado.
- **Fricção para registrar.** Menu, submenu, formulário, OK. Por preguiça você esquece.
- **Dados trancados.** IA proprietária que decide sozinha e erra. Você nunca audita nada.

O **Caixa Forte** ataca os três:

- **Grátis pra sempre.** Licença MIT. Sem trial, sem premium, sem pegadinha.
- **Segundos por transação.** Fale no microfone, digite no navegador, ou mande no Telegram — a IA estrutura.
- **Tudo aberto.** Código no GitHub, prompts no repo, RLS em todas as tabelas.

> *"Seu dinheiro, no controle."*

&nbsp;

## ✨ O que o app faz hoje

<table>
<tr>
<td width="50%" valign="top">

### 🎤 Captura sem fricção

- **Voz no microfone** via Whisper Large V3
- **Texto livre** via Llama 3.3 70B (~300ms)
- **Bot Telegram** com `/start TOKEN` em 10 segundos
- Parser estruturado valida com Zod antes de gravar
- Confiança baixa vai pra fila de revisão

### 🏦 Organização financeira

- **Contas agrupadas por banco** (Nubank, Caixa, Mercado Pago, corretoras)
- **9 tipos:** Conta Corrente, Renda Fixa, Renda Variável, Cripto, FGTS, Poupança, Cartão, Dinheiro, Carteira
- **Logos automáticos** via Google Favicons
- **Agendadas vs. pagas** — transações futuras ficam fora do saldo até você marcar como pagas

</td>
<td width="50%" valign="top">

### 📊 Dashboard honesto

- **Saldo do mês** + Entrada + Saída
- **Tendência 1/6/12 meses** com frase curta explicando a causa (Groq)
- **Gráfico de fluxo** 12 meses com tooltip de saldo
- **Clima ao vivo** da sua cidade (Open-Meteo, 3 dias)
- **Projeções** 6m/12m baseadas no histórico

### 🏷️ Categorização flexível

- Crie, renomeie, aninhe subcategorias
- Clique numa categoria → edita todas as transações dela
- Filtros por mês/6m/12m/intervalo custom
- Busca + criar inline direto do campo de Categoria

</td>
</tr>
</table>

&nbsp;

## 🛡️ Privacidade levada a sério

| Princípio | Implementação |
|---|---|
| **Row-Level Security** | Ativo em todas as tabelas — você só vê os seus dados. |
| **Agregados no admin** | Transações individuais **nunca** aparecem em ferramentas admin, só somas. |
| **Senhas com hash** | Gerenciadas pelo Supabase Auth — nem os admins recuperam, só redefinem. |
| **Zero telemetria invasiva** | Sem ads, sem fingerprinting, sem venda de dados. |
| **Soft-delete reversível** | Desativar a conta é um clique; logar de novo reativa sozinho. |
| **LGPD / GDPR** | Cookie banner no primeiro acesso + documentação pública do que é coletado. |

Leia tudo que coletamos e o que **não** coletamos na <a href="https://caixa-forte-app.vercel.app/docs" target="_blank" rel="noopener noreferrer"><strong>documentação pública</strong></a>.

&nbsp;

## 🧠 IA com Groq — por que Groq?

Tudo roda em [**Groq**](https://groq.com), que serve modelos abertos em latência sub-segundo:

- 🔓 **Llama 3.3 70B** e **Whisper Large V3** — pesos públicos, nada de vendor-lock.
- ⚡ **~300ms** pra estruturar uma transação. 10s de áudio transcrevem em ~2s.
- 🚫 **Seus dados não treinam modelos** — contrato padrão da Groq proíbe.

Três usos concretos:

1. **Parser de transação.** `"paguei 189 no aluguel dia 5"` → JSON com valor, categoria, subcategoria, merchant, data. Validação Zod antes de gravar.
2. **Transcrição de voz.** Áudio até 25MB → texto pt-BR → cai no parser acima.
3. **Explicador de tendência.** Série mensal → frase em pt-BR que explica *por quê* você está empobrecendo, não só *que*.

Transações de confiança baixa caem numa fila de revisão. **Você sempre revê e corrige.**

&nbsp;

## 🤖 Telegram — registre sem abrir o app

Mande uma mensagem ou áudio para [**@caixaforteapp_bot**](https://t.me/caixaforteapp_bot) e a transação entra.

```
1. /app/profile → "Gerar token Telegram" (8 caracteres, expira em 15 min)
2. Cole "/start ABCD1234" no chat com o bot
3. Qualquer mensagem ou áudio depois disso vira transação
```

Mesmo parser que a web usa. Confirmação volta pelo chat com o valor formatado. O bot **nunca** acessa contatos, grupos ou outros chats — só mensagens enviadas pra ele.

&nbsp;

## 🧱 Stack

| Camada | Tech |
|---|---|
| **Frontend** | Next.js 16 (App Router) · React 19 · Tailwind v4 · Radix UI |
| **Backend** | Server Actions · Route Handlers · Supabase Postgres |
| **Auth** | Supabase Auth — email + senha, confirmação por email |
| **IA** | Groq — Llama 3.3 70B (parser + explainer) + Whisper Large V3 |
| **Mapa admin** | React-Leaflet · CartoDB tiles · coords IBGE (5571 municípios) |
| **Clima** | Open-Meteo (sem API key) |
| **Geocoder** | Open-Meteo Geocoding + tabela local `cities_br` |
| **Hospedagem** | Vercel (app) · Supabase (DB + auth + storage) |
| **Observabilidade** | Heartbeat de login, `capture_messages` log, painel sysadmin |

&nbsp;

## 🚀 Rodar localmente

```bash
# 1. Clonar
git clone https://github.com/leonardochalhoub/caixa-forte-app.git
cd caixa-forte-app

# 2. Dependências
npm install

# 3. Env
cp .env.example .env.local
# preencha os valores — ver tabela abaixo

# 4. Migrations: rodar no Supabase Studio ou via PAT
# SQL files em supabase/migrations/

# 5. Seed das 5571 cidades brasileiras com coordenadas
node scripts/seed-cities-br.mjs

# 6. Dev server
npm run dev
```

Abra http://localhost:3000.

&nbsp;

## 🔑 Variáveis de ambiente

| Var | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (server-only) |
| `GROQ_API_KEY` | Token Groq (gratuito em [console.groq.com](https://console.groq.com)) |
| `GROQ_PARSER_MODEL` | Default: `llama-3.3-70b-versatile` |
| `GROQ_CHAT_MODEL` | Default: `llama-3.3-70b-versatile` |
| `GROQ_WHISPER_MODEL` | Default: `whisper-large-v3` |
| `GROQ_PARSER_FALLBACK_MODEL` | Default: `llama-3.1-8b-instant` (usado só em 429) |
| `LLM_PROVIDER` | Default: `groq`. Abstração em `lib/llm/provider.ts` permite trocar provider em 1 arquivo. |
| `TELEGRAM_BOT_TOKEN` | Do BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | 32+ chars aleatórios (`openssl rand -hex 32`) |
| `TELEGRAM_BOT_USERNAME` | Username do bot, sem `@` |
| `NEXT_PUBLIC_SITE_URL` | URL pública do deploy |
| `APP_TIMEZONE` | Default: `America/Sao_Paulo` |
| `BOOTSTRAP_OWNER_EMAIL` | Email do owner inicial (primeiro admin) |

&nbsp;

## 🗺️ Roadmap

| Fase | Status | Item |
|---|---|---|
| **M1** | ✅ Shipped | Captura web (voz + texto), multi-conta, KPIs, categorias |
| **M1.5** | ✅ Shipped | Sysadmin, IBGE cidades, soft-delete, privacidade, clock+weather, paid_at, docs |
| **M2** | ✅ Shipped | Bot Telegram com áudio + texto, idempotência, fuzzy account match |
| **M2** | ✅ Shipped | Snapshots diários do patrimônio (cron + UI PatrimonyTrend de 90d) |
| **M2.5** | ✅ Shipped | Cartão de crédito como conta + faturas + pay_invoice atômico + idempotência |
| **M2.5** | ✅ Shipped | Balanço Patrimonial + DRE + Conciliação com FIPE auto-sync |
| **M3** | 📋 Próximo | Recorrências (aluguel, mensalidade, assinaturas) |
| **M3** | 📋 Próximo | Chat com seu dinheiro (tool-calling Groq + RLS) |
| **M3** | 📋 Próximo | Onboarding guiado pro 1º usuário não-técnico |
| **M4** | 💭 Imaginado | Alertas inteligentes via Telegram |
| **?** | 💭 Imaginado | Portfolio & cripto com preço em tempo real |

&nbsp;

## 🏗️ Arquitetura em 1 minuto

```
┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐
│  Web / PWA   │───▶│  Server Actions  │───▶│  Supabase Postgres│
│  /app/*      │    │  (Next.js)       │    │  + RLS + Triggers │
└──────┬───────┘    └────────┬─────────┘    └───────────────────┘
       │                     │
       │                     ▼
       │             ┌──────────────┐
       │             │  Groq API    │
       │             │  parser +    │
       │             │  whisper +   │
       │             │  chat        │
       │             └──────────────┘
       │
       ▼
┌──────────────┐    ┌─────────────────────┐
│  Telegram    │───▶│  /api/telegram/     │
│  Bot chat    │    │  webhook/[secret]   │
└──────────────┘    └──────────┬──────────┘
                               │
                               ▼
                     mesma pipeline da web
                     (lib/capture/pipeline.ts)
```

&nbsp;

## 🤝 Contribuindo

PRs bem-vindos. Issues bem-vindos. Fork bem-vindo. **Veja [CONTRIBUTING.md](CONTRIBUTING.md)** pro fluxo completo.

Resumo:
- TypeScript strict + ESLint flat config — rode `npm run typecheck && npm run lint && npm test` antes do push
- 90 unit tests passando + 6 ADRs documentando decisões grandes em [`docs/adr/`](docs/adr/)
- CI roda automaticamente em todo PR ([badge no topo](#))
- Filosofia: **útil mas simples**. Grátis pra sempre. Open-source MIT.

&nbsp;

## 📜 Licença

MIT © [Leonardo Chalhoub](https://www.linkedin.com/in/leonardochalhoub/)

Sinta-se à vontade para clonar, modificar, publicar uma variante sua. Pedimos só crédito e que a licença continue aberta.

&nbsp;

## 🙋 Contato

- 💬 Issues no [GitHub](https://github.com/leonardochalhoub/caixa-forte-app/issues)
- 📧 [leochalhoub@hotmail.com](mailto:leochalhoub@hotmail.com)
- 💼 [LinkedIn](https://www.linkedin.com/in/leonardochalhoub/)

&nbsp;

---

<div align="center">

**[🚀 Abra o app →](https://caixa-forte-app.vercel.app/)**

*É preto no branco.*

</div>
