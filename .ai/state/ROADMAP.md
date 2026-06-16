# ROADMAP - Plano Faseado (inicio ao fim)

> Visao macro. Detalhe tela a tela em `docs/backlog-melhorias-telas-2026-06.md`.
> Estado vivo em `CURRENT_STATE.md`; fila em `NEXT_STEPS.md`.

## Fase 0 - Fundacao (CONCLUIDA)

Auth/RBAC, modelo de dados, horas, aprovacoes+automacao, despesas, clientes,
projetos, skills, consultores, financeiro (receita/pagamento) e relatorios MVP.
Publicado em producao com auto-deploy.

## Fase A - Quick wins Horas e Despesas  [CONCLUIDA 2026-06-15]

Tooltip de hover; editar lancamento Enviado (reabertura auditada); visualizador
de anexo em tela (PDF/imagem). Verde: 789 testes, lint, typecheck.

## Fase B - Aprovacoes em massa e governanca de auto-aprovacao  [CONCLUIDA 2026-06-15]

Massa nas abas Pendentes/Historico + reabertura; trava de re-auto-aprovacao.
Verde: 802 testes.

## Fase C - Clientes: cobranca completa e UX  [CONCLUIDA 2026-06-15]

16 tipos de cobranca; upload de logo; fix do foco (era bug do Modal).
Verde: 803 testes. Migration aditiva pendente de apply.

## Fase D - Projetos: skill por alocacao e base de faturamento  [CONCLUIDA 2026-06-15]
(base de faturamento por hora ja existia; entregue `AllocationSkill` + CRUD. Verde: 817 testes.)

## Fase E - Consultores: remuneracao completa  [CONCLUIDA 2026-06-15]

VA/VR/VT no valor acordado; calculadora de encargos CLT (modulo puro, tabelas
2026 parametrizadas). Verde: 839 testes.

## Fase F - Financeiro Pagamento: filtros e e-mail detalhado  [CONCLUIDA 2026-06-15]
(filtros consultor/status/contratacao; e-mail com abertura por projeto. Verde: 844 testes.)

## Fase G - Financeiro Receita: pre-fatura e e-mail (sem NFS-e real)  [CONCLUIDA 2026-06-15]
(pre-fatura builder puro + storage + e-mail idempotente ao cliente. Verde: 863 testes.)

## Fase H - NFS-e real Prefeitura SP  [CONCLUIDA 2026-06-15]

Provider real SP modular (XML builder/parser puros, signer plugavel, SOAP,
IntegrationEvent idempotente, XML/PDF no storage, e-mail NFSE_ISSUED). Degrada
honestamente sem certificado. Verde: 898 testes. PENDENTE: certificado A1 +
credenciais homologacao SP + registrar NfseSigner real (setup externo).

---

## ROADMAP A-H COMPLETO (2026-06-15)

Todas as 8 fases concluidas e verdes (898 testes, lint 0w, typecheck). Pendencias
sao apenas de SETUP externo (migrations a aplicar, buckets, certificado NFS-e),
nao de codigo. Ver `CURRENT_STATE.md` para a lista.

## Ordem e justificativa

A,B (uso diario, baixo risco) -> C,D,E (cadastros que sustentam o financeiro)
-> F,G (financeiro sem dependencia externa) -> H (NFS-e real por ultimo).
