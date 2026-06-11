# Prompt - Rodada 4: Relatorios, Exportacoes e Fechamento

Planejamento gerado em 2026-06-10 apos a entrega da Rodada 3
(`feat: persist expenses and receipts`). A Rodada 4 deve consolidar o MVP
operacional com relatorios de horas/despesas, exportacao CSV e uma primeira
visao de fechamento para financeiro/gestao.

Esta rodada nao deve ser tratada como "ultima rodada do produto". Ela fecha o
nucleo consultor -> gestor -> financeiro do MVP, mas ainda ficam evolucoes
posteriores como Entra ID real, CRUDs administrativos, documentos/RH,
equipamentos, integracoes financeiras e hardening de producao.

## Objetivo da Rodada 4

Criar uma camada confiavel de consulta e exportacao para horas e despesas,
permitindo que gestores e financeiro filtrem, confiram, exportem e acompanhem
o fechamento operacional.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/backlog-refinado-consultor-operacoes.md
- docs/horas-persistencia.md
- docs/despesas-persistencia.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/auth-foundation.md
- docs/design-system.md
- packages/database/prisma/schema.prisma
- docs/prompt-claude-rodada-4-relatorios-fechamento.md

Contexto:
As Rodadas 2 e 3 colocaram horas e despesas no banco real com Prisma,
Server Actions, RBAC, Approval e AuditEvent. Despesas tambem possuem
storageProvider para Supabase Storage, mas o bucket `expense-receipts` e as
envs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` podem ainda nao estar
provisionados. A producao atual segue como ambiente de validacao com dev auth;
use somente dados ficticios.

Objetivo:
Executar a Rodada 4 - Relatorios, Exportacoes e Fechamento, entregando
relatorios operacionais de horas e despesas, exportacao CSV, visao consolidada
para financeiro e badges do launcher derivados de dados reais quando o banco
estiver configurado.

Sub-rodada 4.0 - Validacao de pre-condicoes:
- Verificar se a Rodada 3 esta no estado esperado:
  - migrations aplicadas;
  - seed idempotente;
  - `/app/despesas`, `/app/aprovacoes` e `/app/financeiro` lendo dados reais;
  - storage ainda pode estar indisponivel sem bloquear esta rodada.
- Confirmar qual processo shell/dev server ficou ativo na rodada anterior e
  encerrar apenas se for necessario para `prisma generate` ou validacoes.
- Nao imprimir secrets.
- Se storage estiver configurado, rodar smoke de signed URL; se nao estiver,
  registrar como pendencia sem bloquear relatorios.

Sub-rodada 4.1 - Relatorio de Horas:
- Criar rota/tela de relatorio de horas, preferencialmente `/app/relatorios`
  com abas ou segmentacao para "Horas", "Despesas" e "Consolidado".
- Alternativa aceitavel: `/app/relatorios/horas`,
  `/app/relatorios/despesas` e `/app/relatorios/fechamento`, desde que a
  navegacao fique clara.
- Filtros minimos:
  - periodo inicial/final;
  - cliente;
  - projeto;
  - consultor;
  - status;
  - tipo de atividade, se existir no modelo atual.
- Leitura deve respeitar RBAC:
  - CONSULTANT ve apenas seus proprios dados;
  - PROJECT_MANAGER ve projetos que gerencia;
  - AREA_MANAGER/ADMIN veem escopo amplo;
  - FINANCE pode consultar dados necessarios ao fechamento, sem expor campos
    fora do necessario.
- Exibir:
  - total de horas;
  - total por status;
  - total por projeto/cliente;
  - tabela detalhada com consultor, projeto, data/semana, atividade, horas,
    status e data de envio/aprovacao quando disponivel.
- Nao expor `billingHourlyRate` para perfis sem permissao financeira.

Sub-rodada 4.2 - Relatorio de Despesas:
- Reutilizar dados reais de `Expense`.
- Filtros minimos:
  - periodo inicial/final;
  - cliente;
  - projeto;
  - consultor;
  - status da cadeia de despesa;
  - etapa atual: gestor, financeiro, pagamento, finalizada/reprovada.
- Exibir:
  - total por status;
  - total aprovado financeiramente;
  - total agendado;
  - total pago;
  - tabela detalhada com consultor, projeto, data, valor, status, nota fiscal,
    indicador de comprovante e ultima decisao/comentario quando aplicavel.
- Link de comprovante deve continuar usando Server Action/signed URL com RBAC;
  se storage nao estiver configurado, exibir feedback honesto.

Sub-rodada 4.3 - Consolidado/Fechamento:
- Criar uma visao consolidada para financeiro/gestao com horas aprovadas e
  despesas aprovadas/pagas por cliente/projeto/periodo.
- Decisao para esta rodada:
  - o fechamento mensal e uma VISUALIZACAO/RELATORIO, nao um modelo persistido
    nem um lock de periodo.
  - horas e despesas aparecem juntas no consolidado, mas com secoes separadas
    e totais separados.
  - fechamento persistido/lock contabil fica para rodada futura.
- Filtros:
  - mes/periodo;
  - cliente;
  - projeto;
  - consultor.
- Exibir:
  - horas aprovadas;
  - despesas financeiramente aprovadas;
  - despesas agendadas/pagas;
  - agrupamento por cliente/projeto;
  - indicacao clara de itens pendentes que ainda nao entram no fechamento.

Sub-rodada 4.4 - Exportacao CSV:
- Implementar exportacao CSV server-side para:
  - relatorio de horas;
  - relatorio de despesas;
  - consolidado de fechamento.
- Pode ser via route handler `GET` com query params validados por Zod.
- CSV deve respeitar os mesmos filtros e RBAC da tela.
- CSV deve usar encoding UTF-8, header claro e formato estavel.
- Incluir datas em ISO `yyyy-mm-dd`.
- Valores monetarios devem ter formato consistente e seguro para planilha
  (decimal com ponto ou padrao documentado; evitar formulas/injecao CSV).
- Nao exportar campos sensiveis/secretos nem storage keys internas.
- Testar escaping de virgula, aspas, quebra de linha e strings que comecam com
  `=`, `+`, `-` ou `@`.

Sub-rodada 4.5 - Badges reais e pendencias operacionais pequenas:
- Atualizar badges do launcher para usar dados reais quando o banco estiver
  configurado:
  - horas rascunho/submetidas do consultor;
  - despesas pendentes do consultor;
  - aprovacoes pendentes por role;
  - itens financeiros pendentes, se role financeira.
- Manter fallback honesto para modo demo/sem banco.
- Corrigir, se for de baixo risco, pendencias registradas nas specs:
  - seedar segundo consultor ficticio para smoke fim a fim de decisao de
    despesas sem SELF_APPROVAL;
  - normalizar `NOT_FOUND`/`FORBIDDEN` em signed URL de comprovante para reduzir
    enumeracao;
  - adicionar `select` estreito onde houver leitura trazendo campos financeiros
    desnecessarios;
  - bloquear auto-aprovacao das proprias horas se a regra ainda estiver aberta
    e o product-owner confirmar como padrao de controle.
- Nao transformar esta sub-rodada em refatoracao ampla.

Fora do escopo:
- Modelo persistido de fechamento/competencia contabil.
- Lock de periodo.
- Entra ID real e papéis vindos do Entra/DB.
- Integracao bancaria, ERP, CNAB, Pix ou Open Finance.
- CRUDs administrativos completos.
- Multiplos comprovantes.
- OCR.
- Modulos de RH/documentos/equipamentos.

Agentes a usar:
1. `jump-product-owner`: confirmar filtros, colunas e semantica de fechamento
   visual.
2. `jump-data-modeler`: avaliar necessidade de indices para relatorios e seed
   de segundo consultor ficticio.
3. `jump-fullstack-engineer`: queries, route handlers CSV, paginas e server
   components.
4. `jump-frontend-ux`: filtros, tabelas densas, responsividade e estados vazios.
5. `jump-design-system`: consistencia visual, foco, badges e acessibilidade.
6. `jump-qa-engineer`: testes de RBAC, filtros, CSV e regressao.
7. `jump-devops`: env/deploy Vercel, smoke de rotas e, se storage estiver
   configurado, smoke de signed URL.
8. `jump-code-reviewer`: revisao final obrigatoria antes de commit/push.

Testes esperados:
- Validacao dos filtros por Zod.
- RBAC por role para relatorios de horas, despesas e consolidado.
- PROJECT_MANAGER ve apenas projetos sob sua gestao.
- CONSULTANT ve apenas os proprios dados.
- FINANCE ve dados de fechamento sem acesso indevido a escopo operacional
  desnecessario.
- Totais por status e agrupamentos por projeto/cliente.
- CSV:
  - headers estaveis;
  - filtros respeitados;
  - escaping correto;
  - protecao contra CSV injection;
  - RBAC aplicado tambem nos endpoints de exportacao.
- Launcher badges usando dados reais quando banco configurado.
- Smoke das rotas principais de relatorio.

Criterios de pronto:
- Relatorios de horas, despesas e consolidado disponiveis na navegacao.
- Filtros funcionais e refletidos em query string quando fizer sentido.
- Exportacao CSV funcional para os tres contextos.
- Totais batem com os dados exibidos.
- RBAC aplicado na UI e, principalmente, no servidor.
- Nenhum dado financeiro sensivel vaza para role sem permissao.
- Badges do launcher deixam de depender de mock quando banco esta configurado.
- Seed idempotente preservado, com segundo consultor ficticio se implementado.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel manual validado se a integracao Git ainda nao estiver ativa:
  `npx vercel deploy --prod`.

Mensagem de commit sugerida:
`feat: add operational reports and exports`

Ao final, reporte:
- rotas criadas/alteradas;
- filtros e exportacoes entregues;
- quantidade de testes;
- validacoes executadas;
- deploy Vercel, se feito;
- pendencias remanescentes para pos-MVP/producao real.
```

## Observacoes de produto

Depois desta rodada, o JumpFlow deve ter um MVP operacional bastante completo:
consultor lanca horas/despesas, gestor aprova, financeiro acompanha/paga e a
operacao consegue consultar/exportar dados.

Ainda assim, para chamar de produto pronto para uso real, faltara pelo menos:

- ativar Microsoft Entra ID real e desligar dev auth em producao;
- provisionar Supabase Storage real, se ainda pendente;
- decidir e aplicar governanca de dados reais;
- CRUDs administrativos de clientes/projetos/consultores/alocacoes;
- hardening de seguranca/observabilidade;
- integracao Git da Vercel ou pipeline de deploy;
- eventuais modulos de RH/documentos/equipamentos.
