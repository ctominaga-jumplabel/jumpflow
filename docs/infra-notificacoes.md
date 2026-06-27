# Infra de Notificações & E-mail (Onda 1)

> Status: implementado (fundação) · Criado em 2026-06-22
> Plano: `docs/plano-melhorias-financeiro-operacional.md` (Onda 1)

Esta é a fundação do **motor de notificações** do JumpFlow: templates de e-mail com a
marca, segundo canal (Teams) e o serviço de despacho com **agrupamento por destinatário**.
Tudo funciona localmente sem credenciais (cai em console), e plugamos os provedores reais
via variáveis de ambiente.

## 1. O que foi criado

| Arquivo | Papel |
|---|---|
| `lib/automation/email/theme.ts` | Tokens de marca (Playful Ops) para e-mail — espelham `globals.css`/`docs/design-system.md`. |
| `lib/automation/email/layout.ts` | Renderer HTML zero-dependência (table-based, robusto p/ Outlook) + blocos: `paragraph`, `heading`, `keyValueList`, `dataTable`, `callout`, `kpi`, `button`, `divider`. Retorna HTML **e** texto puro. |
| `lib/automation/email/templates.ts` | Templates operacionais prontos com os textos sugeridos (ver §5). |
| `lib/automation/email-transport.ts` | Estendido: `EmailMessage.html` (Resend agora envia HTML + texto). |
| `lib/automation/webhook-transport.ts` | Canal Teams via Incoming Webhook (MessageCard). URL tratada como segredo. |
| `lib/automation/notifications/dispatch.ts` | Agrupa fragmentos por destinatário, roteia por canal, loga via sink opcional. |
| `lib/automation/notifications/dispatch.test.ts` | Testes do agrupamento, roteamento e tolerância a falha. |
| `schema.prisma` + migration `20260622120000_notification_engine` | `NotificationRule`/`NotificationRecipient` + enums; `TEAMS` e `NOTIFICATION`. |

## 2. Soluções gratuitas escolhidas

- **Envio de e-mail → Resend** (já integrado). Free tier: **3.000 e-mails/mês, 100/dia**, suficiente
  para o volume operacional interno. Sem custo, sem novo SDK.
  Alternativa gratuita: SMTP do **Microsoft 365** (já há Entra ID) — exige só um conector SMTP.
- **Templates de e-mail → renderer próprio** (sem `react-email`/`mjml`). Mantém o bundle leve,
  roda em Server Actions/cron sem build extra e usa os tokens da própria aplicação. É "o template
  da própria aplicação", derivado de `globals.css`.
- **Teams → Incoming Webhook**. Gratuito, nativo do Teams; **não** exige Graph API nem app
  registration. Um admin cria o webhook no canal e cola a URL na regra.
- **In-app notifications**: fora de escopo agora (estratégia e-mail-first). Anotado para o futuro.

## 3. Variáveis de ambiente

```bash
# E-mail
EMAIL_PROVIDER=resend            # console (default) | resend
RESEND_API_KEY=...               # secret
RESEND_FROM_EMAIL="JumpFlow <no-reply@seu-dominio-verificado>"

# Teams (as URLs por canal ficam nas NotificationRule, não aqui)
WEBHOOK_PROVIDER=teams           # console (default) | teams

# Marca (já existente)
NEXT_PUBLIC_APP_NAME=JumpFlow
```

## 4. Como usar (exemplo)

```ts
import { buildLiberacaoEmail } from "@/lib/automation/email/templates";
import { dispatchNotifications } from "@/lib/automation/notifications/dispatch";

const email = buildLiberacaoEmail({
  recipientName: "Ana",
  projectName: "Portal X",
  clientName: "ACME",
  periodLabel: "16–22 jun 2026",
  totalHours: 186,
  consultantsCount: 4,
  exceptions: ["Hora extra: 4h (João)"],
  reviewUrl: "https://app/.../aprovacoes",
});

await dispatchNotifications([
  {
    recipient: { key: "ana@acme.com", channel: "EMAIL", address: "ana@acme.com" },
    title: email.subject,
    blocks: [], // ou use os blocos diretamente para entrar no digest agrupado
  },
]);
```

> Para **agrupar** vários projetos num único e-mail por pessoa, basta emitir um
> `NotificationFragment` por projeto com o mesmo `recipient.key`: o dispatch consolida
> tudo num só envio ("Resumo de notificações (N)").

## 5. Textos e estrutura sugeridos (voz JumpFlow)

A voz é **operacional e direta** — ferramenta de trabalho diário, não newsletter. Estrutura
comum: monograma + nome → barra coral → título forte → corpo escaneável → assinatura "Equipe JumpFlow".

| Evento | Assunto | Estrutura |
|---|---|---|
| **Liberação de horas** (1.1) | `JumpFlow · Liberação de horas — {projeto} ({período})` | Saudação → resumo (projeto/cliente/período/horas/consultores) → **callout de exceções** se houver → CTA "Abrir liberação". |
| **Apuração ao cliente** (1.2) | `JumpFlow · Apuração de horas {competência} — {projeto}` | Tratamento formal → tabela **por consultor** (horas, e valor se permitido) → totais → "responda em caso de divergência". |
| **Alerta de hora extra** (2.5/3.3) | `JumpFlow · Alerta de hora extra — {competência}` | Callout de atenção → **seção CLT/CLT FLEX** e **seção PJ** separadas, cada uma com subtotal. |
| **Novo projeto** (6.1) | `JumpFlow · Novo projeto — {projeto}` | Resumo (projeto/cliente/gestor) → callout se sem contrato comercial → CTA "Abrir projeto". |
| **Faturamento pendente** (4.3/5.2) | `JumpFlow · Faturamento pendente ({total})` | KPI do total → tabela (projeto/cliente/competência/valor/dias em aberto) → CTA "Ver fechamentos". |
| **Contrato ausente** (6.2) | `JumpFlow · Contrato comercial ausente — {projeto}` | Callout de erro → orientação → CTA "Vincular contrato". |

Todos os templates já estão implementados em `templates.ts` e podem ser ajustados de texto sem
tocar no layout.

## 6. Pendências externas (preciso de você)

O código está pronto e roda em modo console. Para **enviar de verdade**, preciso destes itens
que não consigo gerar sozinho (são credenciais/decisões externas):

1. **Remetente de e-mail**: domínio verificado no Resend + `RESEND_API_KEY`, no formato
   `Nome <no-reply@dominio>`. (Ou a decisão de usar SMTP do Microsoft 365 — nesse caso eu adiciono
   o transporte SMTP.)
2. **Caixa de resposta**: os e-mails dizem "responda em caso de divergência". Confirmar se o
   remetente é uma caixa monitorada ou se deve apontar um `reply-to` específico.
3. **URL(s) de Incoming Webhook do Teams**: criadas por um admin no(s) canal(is) de destino
   (Financeiro, Comercial, etc.). Vão para as `NotificationRule`, não para env.
4. **Logo para o cabeçalho** (opcional): hoje uso o monograma textual (`JF`). Se quiser a marca,
   preciso de uma URL pública (https) de um PNG/SVG — e-mail não acessa assets do app.
5. **Volume mensal estimado** de e-mails, para confirmar se o free tier do Resend (3k/mês) basta
   ou se já planejamos o tier pago.

## 6b. Como testar e validar o envio

Ferramenta dev: **`/app/dev/emails`** (404 em produção). Lista os 6 templates, mostra o
preview real em iframe e tem "Enviar teste para mim".

**Nível 1 — visual, sem credenciais (agora):** subir o dev server e abrir `/app/dev/emails`.
Provider = `console`; o preview já valida marca/layout/texto. Os "envios" caem no log do servidor.

**Nível 2 — envio real grátis (Resend, sem domínio):**
1. Criar conta no resend.com **usando `christopher.tominaga@jumplabel.com.br`** — sem domínio
   verificado, o Resend só entrega para o próprio e-mail de cadastro (e só a partir de
   `onboarding@resend.dev`). É exatamente o fluxo de autoteste.
2. Gerar uma API key.
3. No mesmo `.env` que já carrega `DATABASE_URL`:
   ```
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL="JumpFlow <onboarding@resend.dev>"
   ```
4. Reiniciar o dev server, abrir `/app/dev/emails`, clicar "Enviar teste para mim". Chega na caixa.

**Nível 3 — destinatários reais (clientes/gestores):** só após **verificar um domínio** no Resend
(registros DNS) e trocar `RESEND_FROM_EMAIL` para `no-reply@seu-dominio`. Aí cai o limite de "só o
próprio e-mail".

> Cabeçalho do e-mail usa hoje o monograma `JF`. Quando o logo Jump estiver hospedado numa URL
> pública (https), troco o badge pela imagem.

## 8. Onda 2 — eventos de negócio (implementado)

Camada de orquestração que liga eventos reais ao motor:

| Arquivo | Papel |
|---|---|
| `notifications/resolve.ts` | Resolve destinatários de uma regra: `STATIC` (e-mail/URL literal), `ROLE` (usuários ativos com o papel), `PROJECT_MANAGER` (gestor do projeto), `CLIENT_CONTACT` (`Client.contactEmail`). Deduplica por destinatário. |
| `notifications/emit.ts` | Motor: carrega regras ativas do evento+escopo → resolve → **idempotência** (pula quem já recebeu, via `AutomationEmailLog` type `NOTIFICATION`) → despacha agrupado → loga. **Nunca lança** (degrada como o audit). |
| `notifications/events.ts` | `notifyProjectCreated`, `notifyHoursReleased`, `notifyClientBillingSummary` — reúnem dados e chamam o motor. |

**Hooks ativos:**
- `createProject` → `notifyProjectCreated` (evento `PROJECT_CREATED`, escopo GLOBAL). [projetos/actions.ts]
- `advanceRevenueClosing` no `CLOSE` → `notifyHoursReleased` (evento `HOURS_RELEASED`, escopo PROJECT). [financeiro/actions.ts]
- `sendClientBillingSummary` (nova action, **disparo explícito do Financeiro**, não automático) → `notifyClientBillingSummary` (evento `CLIENT_BILLING_SUMMARY`). E-mail ao cliente é externo, então fica sob ação manual.

**Fail-open por design:** sem `NotificationRule` cadastrada para o evento, nada é enviado. Os hooks
são seguros para rodar já — mesmo sem a migration aplicada, `emit` degrada sem quebrar a action.

**Tela de gestão de regras (item 1.4 — implementada):** **`/app/admin/notificacoes`** (ADMIN-only,
auditada). Cria/ativa/remove regras por evento, escolhe escopo (Global/Projeto) e canal
(E-mail/Teams), e gerencia destinatários por tipo: `ROLE` (papel), `STATIC` (e-mail/URL fixo —
inclui os vários e-mails p/ NF), `PROJECT_MANAGER`, `CLIENT_CONTACT`. Arquivos:
`app/app/admin/notificacoes/{page,actions}.ts` + `components/admin/NotificationRulesView.tsx` +
`lib/db/notification-rules.ts`. Entrada no menu Administração.

**Para ativar de fato falta só:** aplicar a migration (`db:deploy`) — cria as tabelas. Depois é só
cadastrar as regras pela tela.

Testes: `emit.test.ts` (resolução de ROLE, idempotência, no-rule, sem DB) + `dispatch.test.ts`. 8 verdes.

## 9. Onda 3 — alerta de hora extra (item 3.3, implementado)

`lib/automation/overtime-alert.ts` + job `/api/jobs/overtime-alert` (cron mensal, dia 1 às 13:00 UTC,
default = mês anterior). Agrega HE de `ConsultantHourBankEntry` (kind OVERTIME) por consultor,
separa por vínculo (CLT/CLT_FLEX vs PJ) e emite `OVERTIME_ALERT` pelo motor — destinatários/canal
vêm das regras (`/app/admin/notificacoes`). Idempotente por competência. Template
`buildAlertaHoraExtraEmail`. Aggregation pura testada (`overtime-alert.test.ts`).

Botão **"Apuração"** (apuração por consultor ao cliente) adicionado na tabela de fechamento mensal
(status CLOSED/INVOICED) → `sendClientBillingSummary`.

**Restante da Onda 3 (pendente — exige modelagem):** 3.1 Sobreaviso (`OnCallEntry`), 3.2 % de HE por
vínculo + cobrança de excedente, 3.4 anexo "ok do responsável" + exibir exceções na liberação,
3.5 cobrança em férias.

## 10. Melhoria #5 — Feed social interno: notificações (implementado)

Reaproveita o motor existente **sem canal novo**. Dois eventos novos em
`NotificationEvent`: `FEED_POST_REPLIED` e `FEED_CONTENT_REACTED`.

| Arquivo | Papel |
|---|---|
| `notifications/feed-events.ts` | `notifyFeedReplied(commentId)` e `notifyFeedReacted({postId|commentId})`. Diferente da Onda 2, o destinatário **não** vem de `rule.recipients`: é sempre o **AUTOR do alvo** (post/comentário). A `NotificationRule` serve só como **liga/desliga** por evento (`count` de regra ativa) — fail-open. |
| `email/templates.ts` → `buildFeedDigestEmail` | Digest de marca: lista "Fulano respondeu seu post / Beltrano reagiu 👍 a seu comentário" + CTA "Abrir o Feed". |
| `migrations/20260626140000_feed_notification_events` + `scripts/migrate-feed-notification-events.mjs` | `ALTER TYPE NotificationEvent ADD VALUE IF NOT EXISTS` (dry-run + `--apply` + registro manual em `_prisma_migrations`). **Não aplicado em prod ainda.** |

**Regras de produto:** nunca notificar a si mesmo (ator == autor → pular).

**Comportamento real de agregação (honesto):** a cada reação NOVA, `notifyFeedReacted` relê
**todas** as reações do alvo (exceto as do próprio autor) e filtra as ainda não entregues
(`AutomationEmailLog` type `NOTIFICATION`, `referenceKey = FEED_CONTENT_REACTED:{reactionId}`,
status `SENT`). As pendentes viram **um** `NotificationFragment` → `dispatchNotifications` (reusa
`groupByRecipient`), e cada `reactionId` consolidado é logado como `SENT`.

> ⚠️ **Não há janela de digest.** Como cada clique chega em sua própria chamada (clique → action
> → emit), reações de usuários distintos geram **um e-mail cada** (idempotente por `reactionId`).
> A consolidação num único e-mail só ocorre quando há **mais de uma reação pendente na mesma
> chamada** — p.ex. um envio anterior falhou e ficou sem log `SENT`, então a próxima chamada junta
> as pendentes. O contrato real está coberto pelo teste `feed-events.test.ts`
> ("CONTRATO REAL (A1): … geram um e-mail cada"). Respostas usam o mesmo modelo com `referenceKey =
> FEED_POST_REPLIED:{commentId}` (uma notificação por resposta).

**Evolução futura (digest por janela):** para realmente agrupar reações de pessoas diferentes num
só e-mail, a reação enfileiraria um fragmento pendente (nova tabela/estado) e um **cron** (plano
Vercel Pro permite +crons) consolidaria por destinatário/janela antes de enviar. Foi avaliado e
deixado de fora desta fatia por ser desproporcional (fila persistida + job) para uma feature
social — registrado aqui como próximo passo se o volume justificar.

**Hooks ativos (post-commit, best-effort):** `addComment` → `notifyFeedReplied`; `toggleReaction`
(só no caminho de **adição**) → `notifyFeedReacted`. Ambos dentro do `try` da action, mas as
funções nunca lançam (degradam como o resto do motor).

Testes: `feed-events.test.ts` (10) — auto-notificação pulada, idempotência por dedupeKey,
agregação de múltiplas reações num digest, reação a comentário, fail-open sem regra, sem DB.

## 7. Gate de deploy

A migration `20260622120000_notification_engine` **ainda não foi aplicada** (esta máquina não tem
`DATABASE_URL`). Rodar `npm run db:deploy` na base antes de mergear na `main` — o build da Vercel
não roda migrate. O schema foi validado (`prisma validate` OK) e o código passa em lint, typecheck
e testes.
