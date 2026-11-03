# SLA do fluxo de horas (item 5)

Tela `/app/sla` + job `/api/jobs/sla-reminders`. Acompanha, por área responsável,
se cada etapa do fluxo — do lançamento de horas ao faturamento e ao pagamento do
consultor — está dentro do prazo em **dias úteis**.

## Processos e etapas

| Processo | Etapa (`SlaStageKey`) | Área | Âncora padrão | Prazo padrão (competência out/2026) |
|---|---|---|---|---|
| Ambos | `TIMESHEET_SUBMISSION` | Consultores | fim do mês + 0 | 30/10 (último dia útil) |
| Ambos | `MANAGER_APPROVAL` | Operação | fim do mês + 1 | 03/11 (Finados em 02/11) |
| Ambos | `OPERATION_CLOSING` | Operação | fim do mês + 1 | 03/11 |
| Faturamento | `BILLING_RELEASE` | Operação | fim do mês + 1 | 03/11 |
| Pagamento | `PEOPLE_PAYMENT_RELEASE` | DP | fim do mês + 4 | 06/11 (1º dia útil + 3 de validação) |
| Pagamento | `INVOICE_REQUEST` | Financeiro | pagamento − 5 | 09/11 |
| Pagamento | `INVOICE_RECEIPT` | Consultores | pagamento − 2 | 12/11 (48 h úteis antes do pagamento) |
| Pagamento | `PAYMENT` | Financeiro | pagamento − 0 | 16/11 |

Configuração em `SlaSettings` (singleton `default`) e `SlaStage` (uma linha por
processo+etapa). Editável na aba **Configuração** (permissão `SLA_CONFIGURACAO`
edit — seed ADMIN + FINANCE); área, âncora e ordem não são editáveis na tela
(definem o fluxo). Toda gravação gera `AuditEvent` `SLA_CONFIG_UPDATED`
(`entityType = SlaConfig`, before/after).

## Regras de calendário (`apps/web/src/lib/sla/business-days.ts`)

- Dia útil = segunda a sexta fora do calendário de feriados. Entram feriados
  **nacionais** sempre e **estaduais** só com `considerStateHolidays`. Municipais
  e feriados vinculados a projeto (folga de cliente) **não** movem prazo interno.
- `COMPETENCE_MONTH_END + N` = N-ésimo dia útil do mês seguinte; `N = 0` = último
  dia útil da competência.
- `PAYMENT_DATE + N` = N dias úteis antes do pagamento; `N = 0` = o dia do pagamento.
- Data de pagamento = `paymentDay` do mês seguinte (limitado ao último dia do
  mês). Em fim de semana/feriado o pagamento é **antecipado** para o dia útil
  anterior — constante `PAYMENT_DAY_NON_BUSINESS_RULE` (troque para
  `NEXT_BUSINESS_DAY` se a política mudar).
- O prazo vence às 23:59:59.999 de America/São_Paulo (offset fixo −03:00; o
  Brasil não tem horário de verão desde 2019).
- "faltam N dias úteis" = dias úteis em (hoje, prazo]; no dia do prazo = "vence hoje".

## Status (`apps/web/src/lib/sla/evaluate.ts`)

`ON_TIME_DONE`, `LATE_DONE`, `PENDING_OK`, `AT_RISK` (faltam ≤
`warningBusinessDays`, incluindo o dia do prazo), `OVERDUE`, `NOT_APPLICABLE`.
A etapa assume o status agregado: concluída (no prazo/atrasada) quando todos os
itens aplicáveis concluíram; senão o status do prazo. "% no prazo" = no prazo ÷
(no prazo + com atraso + atrasados).

### Como cada etapa é considerada concluída (dados existentes, sem novas colunas)

| Etapa | Item | Concluído quando | Instante de conclusão |
|---|---|---|---|
| Lançamento | consultor (alocações ACTIVE/ENDED em projetos com `dailyEntryRequired`) | todo dia útil do mês dentro da alocação tem lançamento SUBMITTED/APPROVED/CLOSED (qualquer projeto) | quando o último dia ficou coberto: max por dia do menor `submittedAt` (fallback `updatedAt`) |
| Aprovação | consultor × projeto com horas | nenhum lançamento DRAFT/SUBMITTED (REJECTED ignorado) | `Approval.createdAt` (APPROVED) mais recente; fallback `TimeEntry.updatedAt` |
| Fechamento operacional | projeto com horas no mês (ou com `OperationClosing`) | `OperationClosing.status = CLOSED` | `closedAt` (fallback `updatedAt`) |
| Liberação faturamento | projeto com horas faturáveis (ou com `RevenueClosing`) | `RevenueClosing` do projeto **ou do cliente sem projeto** em CLOSED/INVOICED | `closedAt` — gravado pela ação CLOSE, limpo no REOPEN e preservado no INVOICED, logo é a liberação vigente; fallback `updatedAt` para fechamentos legados. Só CANCELLED = não se aplica |
| Liberação DP | `ConsultantPayment` PJ/CLT_FLEX não cancelado (CLT fica fora de todas as etapas de pagamento) | status ≥ PEOPLE_RELEASED | `peopleReleasedAt` → `invoiceRequestSentAt` → `approvedAt` → `updatedAt` |
| Solicitação NF | pagamento PJ/CLT_FLEX | status ≥ WAITING_FOR_INVOICE | `invoiceRequestSentAt` → `invoiceReceivedAt` → `updatedAt` |
| Recebimento NF | pagamento PJ/CLT_FLEX | status ≥ INVOICE_RECEIVED | `invoiceReceivedAt` → `invoiceValidatedAt` → `updatedAt` |
| Pagamento | pagamento PJ/CLT_FLEX (CLT segue a folha) | status = PAID | `confirmedPaidAt` → `updatedAt` |

Observações:
- Pagamentos só existem depois do fechamento operacional (que gera o
  `ConsultantPayment`); até lá o atraso aparece na etapa de fechamento.
- Os fallbacks em `updatedAt` são aproximações para registros anteriores às
  colunas de timestamp; podem marcar "com atraso" algo concluído no prazo.

## Tela `/app/sla`

Permissão `SLA_ACOMPANHAMENTO` (view; seed ADMIN, AREA_MANAGER,
PROJECT_MANAGER, FINANCE, PEOPLE). Item "SLA do Fluxo de Horas" no grupo
Operação. Seções: seletor de competência (padrão = mês anterior) + abas de
processo; linha do tempo das etapas (área, prazo dd/mm + dia da semana,
contagem regressiva, % concluído); cards por área (no prazo, em risco,
atrasados, % no prazo); tabela de pendências com filtros e atalho para a tela da
ação; calendário de dias úteis (competência + mês seguinte) com feriados,
prazos e pagamento; histórico de % no prazo das últimas 6 competências; aba
Configuração com prévia ao vivo das próximas 3 competências e avisos de ordem
(ex.: solicitação de NF vencendo antes da liberação do DP).

## Visibilidade e desempenho

- Itens das etapas de pagamento (liberação DP, solicitação/recebimento de NF,
  pagamento) só aparecem para quem tem `PAGAMENTOS` view na matriz; os demais
  veem apenas os totais dessas etapas.
- `PROJECT_MANAGER` sem papel amplo (ADMIN/AREA_MANAGER/FINANCE/PEOPLE) vê nas
  etapas operacionais apenas os projetos que gerencia (`Project.managerUserId`),
  com contagens, status e histórico recalculados sobre esse subconjunto.
- A competência selecionada é lida por completo, sem cache. O histórico das 5
  anteriores usa um digest sem nomes (status + projetos por item), lido em
  paralelo e cacheado com `unstable_cache`. A chave é competência + versão da
  config/feriados + dia. Revalida em 10 min enquanto há prazo futuro e em 6 h
  quando todos os prazos da competência já venceram.

## Job de lembretes `/api/jobs/sla-reminders`

- Protegido por `CRON_SECRET` (`Authorization: Bearer $CRON_SECRET`); aceita GET e POST.
- Avalia a competência corrente e as 3 anteriores (`SLA_REMINDER_LOOKBACK_MONTHS`): pendências vencidas de competências antigas continuam escalando por até 3 meses. Para cada etapa ativa com
  pendências: em risco → `SLA_DEADLINE_APPROACHING` ("faltam N dias úteis");
  vencida → `SLA_OVERDUE` (escalonamento diário até concluir). Não envia em fim
  de semana/feriado.
- Idempotência: `dedupeKey = <yyyy-mm>:<processo>:<etapa>:<dia>`; o motor grava
  `AutomationEmailLog` (`NOTIFICATION`, `referenceKey =
  <evento>:<dedupeKey>:<destinatário>`) e pula quem já recebeu. Rodar várias
  vezes no mesmo dia não duplica; no dia útil seguinte o lembrete se repete.
  Etapas comuns aos dois processos com o mesmo prazo são enviadas uma vez.
- Destinatários: regras em `/app/admin/notificacoes` (seed: ROLE AREA_MANAGER,
  PEOPLE, FINANCE, e-mail). O payload traz a tabela de itens pendentes
  (até 40 linhas) e o link para `/app/sla?m=<competência>`. Nas etapas de pagamento o e-mail traz só contagens (sem nome/contrato), pois os destinatários podem não ter acesso a Pagamentos.

### Agendamento (não configurado)

Desde o ADR17 não há agendador. Para ativar, crie um **cron service no Railway**
que chame diariamente às **08:00 BRT (11:00 UTC)**, de segunda a sexta:

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/jobs/sla-reminders"
```

Expressão cron (UTC): `0 11 * * 1-5`. Feriados são ignorados pelo próprio job.

## Janelas de envio da NF (SLA de Pagamento)

Aba **Configuração** → "Janelas de envio da NF". A **janela padrão** é a de
sempre (NF até o prazo de "Envio da NF" → pagamento até o prazo de
"Pagamento"). O Financeiro cadastra janelas seguintes (até 5): *se a NF chegar
até X, o pagamento sai até Y* — cada data é o N-ésimo dia útil ou um dia fixo
do mês (competência + 0/1/2 meses; dia fixo não útil é antecipado). Tabela
`SlaInvoiceTier`, gravada junto com a configuração (auditada em
`SLA_CONFIG_UPDATED`).

- Na avaliação, a etapa **Pagamento** de cada pagamento vence na data da
  janela em que a NF foi recebida (`invoiceReceivedAt`, dia em São Paulo); NF
  após a última janela usa a data da última. A etapa **Envio da NF** continua
  medida pela janela padrão (o consultor que perdeu a janela 1 aparece com
  atraso). NF após a última janela: o pagamento vence no mesmo número de dias
  úteis da janela padrão (envio → pagamento), contado do recebimento.
- Com prazos por item, o status e a contagem da etapa seguem a pendência mais
  crítica (mostrada no fluxo e nos lembretes).
- O acompanhamento de "Horas → Pagamento" mostra as janelas da competência, e
  o e-mail de solicitação de NF traz a tabela "Envie a NF até → Pagamento até"
  (variáveis `{{tabela_prazos_nf}}`, `{{nf.prazo}}`, `{{pagamento.data}}`;
  templates personalizados já salvos precisam incluir `{{tabela_prazos_nf}}`).

## SLA por projeto (Horas → Faturamento)

Aba **SLA por projeto** (permissão `SLA_PROJETOS`). Para um projeto e uma etapa
(aprovação, fechamento operacional ou liberação para faturamento), o prazo
pode ser em dias úteis após o fim do mês ou **travado num dia do mês** (do
próprio mês de competência ou dos seguintes). Vale só para os itens daquele
projeto no processo de faturamento; os demais seguem o prazo global. A etapa
assume o pior status entre as pendências (um projeto com prazo próprio vencido
deixa a etapa "Atrasado" mesmo antes do prazo global). Auditoria
`SLA_PROJECT_RULE_UPSERTED` / `SLA_PROJECT_RULE_DELETED`.

## Respostas aos e-mails (Resend Inbound)

Em `/app/admin/templates-email`, cada evento tem "Respostas a este e-mail":
e-mails específicos e/ou perfis (permissão `CONFIGURACOES_RESPOSTAS_EMAIL`).

- **Com recebimento configurado** (`RESEND_INBOUND_DOMAIN`,
  `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`): o e-mail sai com Reply-To
  `respostas+<token>@<domínio>`. O Resend recebe a resposta e chama
  `POST /api/webhooks/resend/inbound` (`email.received`, assinatura Svix). O
  Flow guarda a resposta (`InboundEmail`) e a encaminha, com anexos, aos
  destinatários (Reply-To = consultor).
- **Solicitação de NF**: as respostas são sempre registradas; sem destino
  configurado, são encaminhadas ao perfil FINANCE. Anexos PDF/XML/imagem
  (exceto imagens embutidas) viram NF do pagamento (`source = EMAIL`) e o
  status avança para NF Recebida, como no upload — **só** quando o remetente é o
  e-mail cadastrado do consultor e o pagamento ainda aceita NF do dono (até NF
  Recebida). Fora disso a resposta fica para triagem do Financeiro. Falha no
  meio do processamento devolve 500 e a reentrega do Resend retoma de onde
  parou. Em Pagamentos (`PAGAMENTOS_RESPOSTAS_EMAIL`) aparecem "N respostas por
  e-mail" (corpo em iframe isolado, sem scripts) e a prévia/abertura da NF.
- **Sem recebimento configurado**: o Reply-To aponta direto para os
  destinatários configurados; nada fica registrado no Flow.

### Configuração no Resend (uma vez)

1. Domains → adicionar o subdomínio de respostas (ex.:
   `respostas.flow.jump.tec.br`) e habilitar **Receiving**; criar o registro
   **MX** indicado no DNS.
2. Webhooks → endpoint `$NEXT_PUBLIC_APP_URL/api/webhooks/resend/inbound`,
   evento `email.received`; copiar o signing secret para
   `RESEND_WEBHOOK_SECRET` no Railway.
3. Definir `RESEND_INBOUND_DOMAIN` no Railway e fazer o deploy.
