# Architecture Decision Records

Decisões arquiteturais relevantes do Caixa Forte. Conselho v2
(eng-software) flagou: "13 commits da última sessão fizeram tradeoffs
grandes sem registro. Daqui 6 meses ninguém lembra *por quê*."

Cada ADR cobre **uma decisão**: contexto, alternativas, escolha,
consequências, referências.

## Índice

| # | Título | Status |
|---|---|---|
| [0001](./0001-credit-card-as-account.md) | Cartão de crédito modelado como Account | Aceito |
| [0002](./0002-idempotency-strategy.md) | Estratégia de Idempotência (3 camadas) | Aceito |
| [0003](./0003-rpc-security-definer.md) | RPCs com SECURITY DEFINER | Aceito |
| [0004](./0004-transfer-peer-id-bidirectional.md) | Transferências via transfer_peer_id self-FK | Aceito |
| [0005](./0005-llm-provider-abstraction.md) | Abstração de Provider LLM | Aceito |
| [0006](./0006-balance-snapshots.md) | Balance Snapshots Diários | Aceito |

## Como adicionar novo ADR

1. Pegue próximo número da sequência.
2. Crie `docs/adr/NNNN-titulo-curto-kebab.md`.
3. Use template: **Status** · **Contexto** · **Decisão** · **Consequências** · **Referências**.
4. Atualize este índice.
5. Commite junto com a mudança que motivou o ADR.
