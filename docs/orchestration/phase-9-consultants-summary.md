# Phase 9 - Consultants, Contracts And Benefits Summary

Data: 2026-06-14
Status: concluida

## Objetivo

Evoluir Consultores para leitura real, cadastro sensivel auditavel, provider abstractions e base de compensacao/beneficios.

## Escopo Implementado

- `/app/consultores` usa dados reais quando o banco esta configurado e fallback demo sem banco.
- `listConsultantDirectory` seleciona apenas dados nao sensiveis:
  - nome;
  - email;
  - cargo;
  - senioridade;
  - area;
  - status;
  - alocacao ativa agregada;
  - top skills.
- Actions auditaveis para:
  - identidade do consultor;
  - dados pessoais;
  - empresa/CNPJ;
  - endereco/CEP;
  - conta bancaria;
  - compensacao;
  - beneficios.
- Provider abstraction de CEP em `lib/cep/provider.ts`, desabilitado por padrao e BrasilAPI quando `CEP_PROVIDER=brasilapi`.
- CNPJ existente foi reaproveitado no cadastro de empresa do consultor.
- `lookupConsultantCnpj` e `lookupConsultantCep` aplicam dados via provider e registram auditoria.
- CLT FLEX exige:
  - valor CLT e valor PJ;
  - conta CLT ativa utilizavel;
  - conta PJ ativa utilizavel.
- Conta utilizavel exige Pix ou banco/agencia/conta.
- UI de detalhe no diretorio permite salvar identidade, criar conta CLT/PJ por Pix e salvar compensacao CLT FLEX conforme permissao.
- Funcao pura `computeCompensation` calcula compensacao, beneficios e descontos de forma deterministica.

## Arquivos Principais

- `apps/web/src/app/app/consultores/page.tsx`
- `apps/web/src/app/app/consultores/actions.ts`
- `apps/web/src/components/consultants/ConsultantDirectory.tsx`
- `apps/web/src/components/consultants/ConsultantDirectory.test.tsx`
- `apps/web/src/lib/db/consultants.ts`
- `apps/web/src/lib/cep/provider.ts`
- `apps/web/src/lib/consultants/schemas.ts`
- `apps/web/src/lib/consultants/compensation.ts`
- `apps/web/src/lib/consultants/compensation.test.ts`
- `apps/web/src/lib/auth/route-permissions.ts`
- `apps/web/src/components/modules-smoke.test.tsx`

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/components/consultants/ConsultantDirectory.test.tsx src/lib/consultants/compensation.test.ts`: passou, 2 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 69 arquivos e 751 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 9: GO com um achado medio corrigido.
- `claude -p` recheck read-only apos correcoes: GO.

## Achados do Claude Corrigidos

- `toFailure` de consultores agora repropaga erros `NEXT_*`/redirect dos guards.
- CLT FLEX agora exige contas CLT/PJ utilizaveis, nao apenas linhas vazias.
- UI de conta bancaria pede Pix antes de criar a conta usada pela regra CLT FLEX.

## Pendencias / Observacoes

- Microsoft Graph/Entra automatico ficou deferido; a identidade esta modelada para ser sincronizavel sem acoplar regra ao provider.
- Modal de detalhe ainda nao pre-carrega todas as entidades sensiveis existentes; a fase entregou actions e caminhos de criacao/atualizacao.
- `providerSnapshot` guarda payload bruto de CNPJ/CEP; confirmar politica de retencao/expurgo.
- A migration da Fase 2 ainda precisa ser aplicada em ambiente com banco real.

