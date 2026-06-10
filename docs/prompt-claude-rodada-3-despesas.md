# Prompt - Rodada 3: Persistencia de Despesas e Comprovantes

Planejamento gerado em 2026-06-10 apos a entrega da Rodada 2
(`feat: persist timesheet entries`). A Rodada 3 deve persistir despesas,
integrar comprovantes via Supabase Storage e trocar os mocks de despesas por
dados reais, mantendo o ambiente atual como validacao com dados ficticios.

## Decisoes confirmadas para esta rodada

1. **Despesas sao modulo separado** em `/app/despesas`.
2. **Storage de comprovantes**: Supabase Storage.
3. **Bucket**: `expense-receipts`.
4. **Naming/path dos arquivos**:
   - formato: `expenses/{expenseId}/{timestamp}-{safeFileName}`;
   - exemplo: `expenses/exp_123/2026-06-10T143000Z-nota-fiscal-uber.pdf`;
   - nao incluir CPF, nome de consultor, cliente, projeto ou dado sensivel no
     path.
5. **Tipos aceitos**:
   - MIME: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`;
   - extensoes: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`.
6. **Tamanho maximo**: 10 MB por comprovante.
7. **Quantidade MVP**: 1 comprovante por despesa.
8. **Metadados no banco**:
   - `fileName`;
   - `contentType`;
   - `size`;
   - `storageBucket`;
   - `storageKey`;
   - `uploadedByUserId`;
   - `createdAt`.
9. **Fluxo de aprovacao**:
   - `DRAFT` -> `SUBMITTED` -> `MANAGER_APPROVED` ->
     `FINANCE_APPROVED` -> `PAYMENT_SCHEDULED` -> `PAID`;
   - reprovacoes separadas: `MANAGER_REJECTED` e `FINANCE_REJECTED`;
   - gestor do projeto aprova primeiro;
   - financeiro aprova depois e controla pagamento manualmente.
10. **RBAC**:
    - consultor cria/edita/exclui rascunho, envia e acompanha status;
    - gestor do projeto aprova/reprova despesas dos seus projetos;
    - financeiro aprova/reprova financeiramente e altera status de pagamento;
    - admin/area manager podem ter acesso amplo conforme o RBAC existente;
    - financeiro nao deve aprovar como gestor do projeto, salvo se tambem tiver
      role/permissao de gestor/admin.
11. **Integracao bancaria/ERP**: fora do escopo. Status de pagamento sera
    manual no MVP.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/backlog-refinado-consultor-operacoes.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/horas-persistencia.md
- docs/auth-foundation.md
- docs/design-system.md
- packages/database/prisma/schema.prisma
- docs/prompt-claude-rodada-3-despesas.md

Contexto:
A Rodada 2 esta entregue e em producao: horas agora persistem no Supabase via
Prisma, com Server Actions, RBAC, Approval, AuditEvent e automacao de
aprovacao. Despesas ainda usam mocks, mas a tela `/app/despesas`,
`/app/aprovacoes` e `/app/financeiro` ja possuem experiencia inicial. A
producao atual ainda e ambiente de validacao com `AUTH_DEV_MODE=true` e
`ALLOW_DEV_AUTH_IN_PRODUCTION=true`; portanto use somente dados ficticios.

Objetivo:
Executar a Rodada 3 - Persistencia de Despesas e Comprovantes, substituindo
os mocks de despesas por banco real e Supabase Storage, com validacao,
auditoria, RBAC e testes.

Sub-rodada 3.0 - Registrar decisoes e preparar storage:
- Atualize `docs/backlog-refinado-consultor-operacoes.md` removendo as
  pendencias ja decididas sobre despesas.
- Registre as decisoes de bucket, naming convention, limites de arquivo e
  fluxo gestor do projeto -> financeiro.
- Criar/validar uma camada `storageProvider` para isolar o dominio do
  Supabase Storage.
- Bucket: `expense-receipts`.
- Path: `expenses/{expenseId}/{timestamp}-{safeFileName}`.
- O path nao pode conter CPF, nome de consultor, cliente, projeto ou dado
  sensivel.
- Tipos aceitos: PDF, JPEG, PNG e WebP.
- Limite: 10 MB.
- MVP: 1 comprovante por despesa.
- Usar URLs assinadas para visualizacao/download quando aplicavel.
- Nao commitar secrets e nao imprimir env vars sensiveis.

Sub-rodada 3.1 - Modelo de dados e migration:
- Criar ou ajustar modelos Prisma para `Expense` e comprovante/metadados de
  arquivo.
- Se fizer sentido, criar modelo separado `ExpenseAttachment`; caso contrario,
  justificar uma coluna embutida no `Expense`. Preferencia: modelo separado se
  isso simplificar evolucao futura para multiplos anexos.
- Criar enums/status suficientes para o fluxo:
  - `DRAFT`
  - `SUBMITTED`
  - `MANAGER_APPROVED`
  - `MANAGER_REJECTED`
  - `FINANCE_APPROVED`
  - `FINANCE_REJECTED`
  - `PAYMENT_SCHEDULED`
  - `PAID`
  - `PAYMENT_CANCELLED` se necessario para pagamento manual.
- Modelar status de pagamento manual de forma clara, sem depender de
  integracao externa.
- Integrar despesas com `Approval` e `AuditEvent`.
- Garantir relacionamento com consultor, projeto, usuario criador e decisores.
- Estender seed idempotente com despesas ficticias de validacao, incluindo ao
  menos:
  - rascunho;
  - enviada aguardando gestor;
  - aprovada pelo gestor aguardando financeiro;
  - aprovada financeiramente;
  - pagamento agendado;
  - paga;
  - reprovada pelo gestor;
  - reprovada pelo financeiro.
- Rodar `npm run db:generate`, migration/deploy necessario e seed.
- Atencao Windows: se `prisma generate` falhar por EPERM na DLL do query
  engine, pare o dev server antes de gerar.

Sub-rodada 3.2 - Server Actions, telas e troca dos mocks:
- Substituir despesas mockadas por queries reais no modulo `/app/despesas`.
- Implementar Server Actions com Zod + RBAC para:
  - criar despesa como rascunho;
  - editar despesa em `DRAFT` ou `MANAGER_REJECTED`/`FINANCE_REJECTED` quando
    a regra permitir reenvio;
  - excluir rascunho;
  - anexar/substituir comprovante permitido;
  - enviar para aprovacao (`DRAFT` -> `SUBMITTED`);
  - aprovar/reprovar como gestor do projeto;
  - aprovar/reprovar como financeiro;
  - alterar status manual de pagamento como financeiro.
- Toda mutacao deve validar no servidor:
  - projeto ativo e alocacao/visibilidade do consultor quando aplicavel;
  - valor positivo;
  - data valida;
  - descricao obrigatoria;
  - nota fiscal opcional;
  - comprovante com MIME/extensao/tamanho permitidos.
- Reprovacao deve exigir comentario.
- Toda decisao deve gerar `Approval` e `AuditEvent` na mesma transacao.
- Consultor nao pode alterar despesa ja enviada/aprovada/paga, exceto fluxo
  explicito de correcao apos reprovacao.
- `/app/aprovacoes` deve ler despesas reais junto com horas reais, mantendo
  filtro por tipo (`HOURS`/`EXPENSE`).
- `/app/financeiro` deve ler despesas reais e permitir controle manual de
  pagamento apenas para roles financeiras.
- Remover ou isolar mocks de despesas antigos para que nao parecam dados reais.
  Se algum mock sobrar para demo/teste, marcar claramente como fixture/teste.
- Garantir feedback honesto quando banco ou storage estiverem indisponiveis.

Fora do escopo:
- Integracao bancaria, ERP, CNAB, Pix ou Open Finance.
- Multiplos comprovantes por despesa.
- OCR/leitura automatica de nota.
- Relatorios CSV completos (Rodada 4).
- CRUDs administrativos completos de clientes/projetos/consultores.
- Uso de dados reais da Jump enquanto producao estiver em dev auth.

Agentes a usar:
1. `jump-product-owner`: confirmar criterios de aceite e remover ambiguidades.
2. `jump-expenses-agent`: liderar fluxo de despesas, comprovantes, pagamento e
   aprovacao gestor -> financeiro.
3. `jump-data-modeler`: schema Prisma, migration, enums, seeds idempotentes.
4. `jump-devops`: Supabase Storage, env vars, deploy Vercel e smoke de rotas.
5. `jump-fullstack-engineer`: Server Actions, queries, UI e troca de mocks.
6. `jump-frontend-ux`: formularios, estados, feedback, acessibilidade e
   consistencia com o Playful Ops.
7. `jump-qa-engineer`: testes unitarios/integracao com fake do Prisma/storage,
   sem rede quando possivel.
8. `jump-code-reviewer`: revisao final obrigatoria antes de commit/push.

Testes esperados:
- Validacao de arquivo: MIME, extensao, tamanho, nome seguro e storage key.
- RBAC de despesas: consultor, gestor do projeto, financeiro, admin.
- Transicoes de status felizes e proibidas.
- Reprovacao exige comentario.
- Financeiro nao aprova como gestor salvo permissao adequada.
- Server Actions com Prisma/storage mockados.
- `/app/aprovacoes` mistura horas reais e despesas reais sem regressao.
- `/app/financeiro` protege pagamentos por role.
- Smoke visual dos fluxos principais de despesas.

Criterios de pronto:
- Decisoes documentadas no backlog.
- Migration criada/aplicada quando necessaria.
- Seed idempotente com dados ficticios.
- Despesas sobrevivem a reload: criar, editar, anexar, enviar, aprovar gestor,
  aprovar financeiro, agendar pagamento e marcar como paga.
- Comprovantes sao gravados no Supabase Storage via `storageProvider`, com
  metadados persistidos no Postgres.
- Acesso a comprovantes respeita RBAC e usa URL assinada quando aplicavel.
- Toda mutacao sensivel tem Zod + RBAC no servidor.
- Approval e AuditEvent gerados corretamente.
- Mocks antigos nao aparecem como dados reais.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel manual validado se a integracao Git ainda nao estiver ativa:
  `npx vercel deploy --prod`.

Mensagem de commit sugerida:
`feat: persist expenses and receipts`

Ao final, reporte:
- migrations/seeds executados;
- rotas testadas;
- quantidade de testes;
- deploy Vercel, se feito;
- pendencias remanescentes para a Rodada 4.
```

## Observacoes operacionais

- O deploy automatico por GitHub ainda nao esta garantido; se a integracao Git
  da Vercel continuar ausente, use deploy manual por CLI.
- A producao atual e ambiente de validacao em dev auth. Nao carregar despesas
  reais, comprovantes reais ou dados pessoais/sensiveis.
- Como o storage tera documentos privados, trate bucket, paths e signed URLs
  como superficie de seguranca, nao apenas como detalhe tecnico.
