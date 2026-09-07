# COE — Centro Operacional de Excelência

> Núcleo curado de consultores estratégicos + composição de times para
> **paralelizar frentes** de um projeto. Rota: `/app/coe`.

## 1. O problema que o COE resolve

A IA de Alocação (`/app/alocacao-ia`, §8.2 do roadmap de Talentos) responde
**"quem é o melhor candidato para UMA vaga"**. Ela ranqueia pessoas, uma lista
por vez.

O COE responde uma pergunta diferente, que o ranking por vaga não resolve:

> "Que TIME eu monto para tocar N frentes deste projeto em paralelo, sem repetir
> ninguém, e esse time cobre as skills e tem capacidade para isso?"

As três lacunas fechadas:

| Lacuna | Antes | No COE |
| --- | --- | --- |
| Curadoria de quem é estratégico | não existia | `CoeMember` (núcleo com área de excelência) |
| Atribuição de N pessoas a M frentes | ranking 1 alvo → 1 lista | `composeSquad` (guloso global, sem repetição) |
| Cobertura e capacidade do CONJUNTO | gap e heatmap pessoa a pessoa | `aggregateSkillCoverage` / `aggregateCapacity` |

## 2. Princípio diretor

**A composição é SUGESTÃO.** Ela distribui pessoas por frentes e mostra o porquê
de cada escolha. Ela **não cria `Allocation`** — a alocação continua sendo
decisão humana no módulo de Projetos. É o mesmo princípio da §10 do roadmap de
Talentos, e está escrito na própria tela.

## 3. Arquitetura

```text
apps/web/src/
  lib/coe/
    types.ts       # tipos puros (slots, atribuição, cobertura, capacidade)
    engine.ts      # núcleo determinístico e PURO
    visibility.ts  # RBAC (3 fronteiras)
    schemas.ts     # validação Zod (query + actions)
  lib/db/
    coe.ts         # reads Prisma + gate financeiro
    coe.mock.ts    # degradação sem banco
  app/app/coe/
    page.tsx       # server component (guard + reads)
    actions.ts     # server actions (curadoria + propostas)
  components/coe/
    CoeView.tsx / CoeCompositionPanel.tsx / CoeSlotCard.tsx
    CoeNucleusPanel.tsx / CoeSquadsPanel.tsx
```

A engine é **pura** (sem I/O, sem RBAC, sem LLM). Por isso ela roda também no
cliente: trocar uma pessoa de frente refaz cobertura e capacidade na hora, sem
roundtrip e **sem uma segunda implementação da regra**.

### 3.1 Reuso da IA de Alocação

O COE **não redefine** os pesos do fit. Cada par (frente, candidato) é pontuado
por `computeFit` da IA de Alocação, com os mesmos fatores e pesos:
skills 0.50 · disponibilidade 0.25 · histórico com o cliente 0.10 ·
financeiro 0.15 (renormalizados quando o financeiro não entra).

Sobre esse fit o COE aplica **um único ajuste próprio**, sempre exibido em
separado: a **aderência de senioridade** da pessoa à frente.

| Situação | Delta | Racional |
| --- | ---: | --- |
| Senioridade exata | **+8** | encaixe ideal |
| Acima do exigido | **+2** | serve, mas queimar um sênior numa frente júnior tem custo de oportunidade |
| Um nível abaixo | **−8** | risco de a frente não entregar sozinha |
| Dois ou mais abaixo | **−16** | risco alto — justamente o que a paralelização não tolera |

`slotScore = clamp(fit.score + seniorityDelta, 0, 100)`. A tela mostra as três
parcelas lado a lado; nunca um número redondo sem origem.

A escada de senioridade (`SENIORITY_RANK`) é **semântica**, não a ordem de
declaração do enum Prisma (que cresceu por append para espelhar o CRM). Trilhas
paralelas compartilham degrau — `TECH_LEAD`/`SPECIALIST`,
`ARCHITECT`/`COORDINATOR`, `MANAGER`/`PRINCIPAL`: trocar entre elas não é subir
nem descer.

### 3.2 Atribuição: guloso global

Todos os pares (frente × candidato) são pontuados e ordenados por score desc; o
par de maior score cujo **slot e pessoa** ainda estão livres é fixado, e assim
por diante.

Determinístico e explicável. Resolve o essencial: a mesma pessoa não ocupa duas
frentes, e a melhor pessoa não é gasta numa frente em que outra serve igualmente
bem enquanto a frente difícil fica vazia.

**Não é o ótimo global** (Hungarian) — é uma aproximação gulosa, coerente com o
princípio de que a IA sugere e o humano decide. Por isso cada frente devolve
alternativas para troca manual.

### 3.3 Troca manual

`applyManualAssignment` é pura e garante que **ninguém ocupa duas frentes**: se a
pessoa escolhida já está em outra, as duas frentes **trocam de ocupante**.
Nenhuma frente é esvaziada por efeito colateral.

Isso só se sustenta porque a lista de alternativas é uma **população global e
fechada**: `composeSquad` monta um único conjunto — a união dos melhores de cada
frente com os que ficaram atribuídos — e oferece **esse mesmo conjunto em todas
as frentes**, cada pessoa avaliada para a frente em que aparece (o score é sempre
o daquela frente, nunca herdado de outra). As alternativas não são filtradas ao
longo das trocas, o que torna a operação reversível.

> **Por que a população precisa ser fechada.** Numa primeira versão cada frente
> listava apenas o próprio top-N. Bastava puxar para uma frente alguém que não
> estava no conjunto inicialmente atribuído: essa pessoa passava a ocupar um slot
> sem constar das listas das outras frentes, e a troca seguinte não encontrava o
> ocupante que saía — a frente de origem **esvaziava** e a pessoa sumia da
> composição, com a UI dizendo, falsamente, que faltavam candidatos. Fechar a
> união elimina a classe inteira do problema. Coberto por regressão em
> `engine.test.ts` ("nunca esvazia uma frente ao longo de uma sequência de
> trocas"), com rankings divergentes por frente — o cenário que expõe o caso.

**Teto da população** (`MAX_SWAP_POPULATION`): o payload cresce com
população × frentes, então a população é limitada por mérito (melhor score
alcançado em qualquer frente), **nunca cortando quem está atribuído**. A correção
vem de a população ser *global*, não de ser *grande*, então o teto não
reintroduz o bug — apenas reduz o leque oferecido. Ordem de grandeza medida:
~40 KB no caso típico (3 frentes, 30 candidatos, 4 skills) e ~340 KB no extremo
(12 frentes, 80 candidatos, 8 skills). Ver §9.5.

### 3.4 Frentes (slots)

1. **`ProjectPlannedProfile`** (preferido): a demanda orçada do CRM — cargo,
   senioridade e **quantidade**, expandida por quantidade. Teto de `MAX_SLOTS`
   (12); acima disso a tela avisa quantas posições ficaram de fora.
2. **Frentes genéricas** (fallback): quando o projeto não tem perfis planejados,
   N frentes sem senioridade exigida, informadas na tela. O bundle diz isso em
   `notice` — a tela **não finge** que a demanda veio do CRM.

**Limitação conhecida e deliberada:** o schema não liga skill a perfil planejado
(`ProjectPlannedProfile` não tem relação com `Skill`). Por isso todas as frentes
do mesmo projeto compartilham a exigência técnica — a união das `AllocationSkill`
do projeto mais as skills marcadas na tela — e a **senioridade é o que diferencia
uma frente da outra**. Um vínculo skill↔perfil planejado é a evolução natural.

### 3.5 Capacidade agregada

Diferença deliberada frente à IA de Alocação: no COE a janela **sempre existe**
(sem `periodStart` usamos a semana corrente), porque capacidade agregada é
entregável desta tela.

Por semana, cada membro contribui `100 − %alocado`. **Férias, afastamento e
inatividade contam zero**, coerente com o read-model do Mapa de Disponibilidade.
Membro sem linha de disponibilidade é contado como **bloqueado**, nunca como
livre: capacidade não medida não vira capacidade presumida.

`headcountEquivalent = totalLivre / (100 × semanas)` responde direto quantas
frentes o time sustenta em paralelo na janela.

### 3.6 Ciclo de import (armadilha estrutural)

`FINANCIAL_ROLES` vive em `lib/auth/roles.ts` (módulo folha), **não** em
`route-permissions.ts`. Motivo: `route-permissions` importa cada
`lib/<modulo>/visibility` para montar `routePermissions`, e esses módulos
precisam de `FINANCIAL_ROLES`. Com a constante em `route-permissions`,
inicializar um `visibility` primeiro fechava o ciclo — o binding resolvia como
`undefined` e a regra de rota do módulo nascia **sem `access`**, em silêncio.

`route-permissions` reexporta o símbolo, então todos os consumidores históricos
seguem funcionando. Afetava também `allocation-ai`, `project-risk` e
`consultant-score`, corrigidos junto. Regressão em
`lib/auth/route-permissions.import-order.test.ts`, que importa os `visibility`
**antes** de `route-permissions` — o teste padrão não pega, porque nele
`route-permissions` é o módulo de entrada.

## 4. RBAC — três fronteiras distintas

| Fronteira | Papéis | Onde é aplicada |
| --- | --- | --- |
| **Ler** o COE | ADMIN, PEOPLE, AREA_MANAGER, PROJECT_MANAGER, SALES | `requireRole` na page + `routePermissions` |
| **Curar** o núcleo | ADMIN, PEOPLE, AREA_MANAGER | server actions de `CoeMember` |
| **Propor** time | ADMIN, AREA_MANAGER, PROJECT_MANAGER, SALES | server actions de `CoeSquad` |

Decisões:

- **PEOPLE entra** (diferente da IA de Alocação): dizer "esta pessoa é
  estratégica" é governança de talentos, não staffing comercial.
- **PROJECT_MANAGER e SALES não curam**: eles consomem o núcleo para compor
  times; se curassem, a curadoria viraria reflexo da demanda do projeto da vez.
- **PEOPLE não propõe**: lê e cura, mas não decide staffing.
- **FINANCE fica fora**: o COE é uma superfície de capacidade, não financeira.
- **Propostas têm dono**: alterar status ou remover uma proposta é do autor ou da
  governança (ADMIN/AREA_MANAGER). Propostas concorrentes para o mesmo projeto
  são o uso esperado da tela — qualquer `COE_SQUAD_WRITE_ROLES` apagando o
  cenário de outra pessoa seria destrutivo.

### 4.2 Matriz de permissões

O code `COE` semeia **apenas `view`**, de propósito. As duas escritas têm
fronteiras diferentes e um único code não as distingue: conceder `COE.edit`
abriria curadoria e proposta de uma vez. Semear `create`/`edit` sugeriria um
controle que a matriz não exerce (revogar não bloquearia nada), então não
semeamos — as escritas são checadas por papel nas server actions. Separar em
codes-filhos (nos moldes de `CONSULTORES_*`) é a evolução se a matriz precisar
governá-las.

### 4.1 Fronteira financeira

O fator financeiro do fit (custo × valor de venda → margem) só é computado para
`FINANCIAL_ROLES` (ADMIN/AREA_MANAGER/FINANCE) — o servidor **nem busca** o dado
para os demais. `PROJECT_MANAGER` e `SALES` compõem times **sem ver margem**.

Nenhuma tabela do COE guarda custo, valor ou margem. O único número persistido é
`CoeSquadMember.slotScore` (0..100), que não permite reconstruir valores.

## 5. Schema

Migration: `20260906120000_coe_centro_operacional_excelencia` — **aditiva**: um
enum e três tabelas novas, nenhuma tabela existente alterada.

| Model | Papel |
| --- | --- |
| `CoeMember` | curadoria: consultor + `focusArea` + `active`. `@@unique(consultantId)` |
| `CoeSquad` | proposta de time por projeto + janela + `CoeSquadStatus` |
| `CoeSquadMember` | um slot da proposta. `@@unique(squadId, slotKey)` |

Decisões:

- **Sair do núcleo desativa, não apaga** (`active=false`): preserva o histórico
  de curadoria e mantém íntegras as propostas que já citaram a pessoa. Entrar de
  novo **reativa** o registro (a action é idempotente por consultor).
- `CoeSquadMember.consultantId` é `onDelete: Restrict` — uma proposta viva impede
  o apagamento silencioso de quem foi proposto.
- Autoria (`addedById`, `createdById`) é `onDelete: SetNull`: remover o usuário
  não apaga a curadoria nem a proposta.

## 6. Auditoria

Toda escrita gera `AuditEvent` — entrar/sair do núcleo e propor um time são
decisões de alocação de pessoas:

`COE_MEMBER_ADDED` · `COE_MEMBER_REACTIVATED` · `COE_MEMBER_UPDATED` ·
`COE_MEMBER_DEACTIVATED` · `COE_SQUAD_CREATED` · `COE_SQUAD_STATUS_CHANGED` ·
`COE_SQUAD_DELETED`

### 6.1 Idempotência da curadoria

Entrar no núcleo é um `upsert` na chave única `consultantId`: duas curadorias
simultâneas do mesmo consultor não viram erro de constraint. Na reativação o
`addedById` original é **preservado** — quem curou primeiro é a informação de
governança.

## 7. Degradação sem banco

Sem `DATABASE_URL`, `getCoeComposition` roda a **mesma engine pura** sobre um
núcleo sintético e devolve `fromMock: true`. A tela rotula os dados como
demonstração. Espelha o que a IA de Alocação e o Mapa de Disponibilidade já
fazem.

## 8. Testes

70 testes ao todo:

- `lib/coe/engine.test.ts` (39): aderência de senioridade, saturação do score,
  não repetição, encaixe por senioridade, frentes vazias, determinismo, população
  de troca idêntica em todas as frentes, **regressão do esvaziamento de frente**,
  reversibilidade, imutabilidade, **ausência do fator financeiro quando o gate
  está fechado**, cobertura agregada, capacidade (incluindo membro sem linha =
  bloqueado).
- `lib/coe/visibility.test.ts` (11): congela as três fronteiras de RBAC e o gate
  financeiro.
- `lib/coe/schemas.test.ts` (12): defaults da query, data real de calendário e as
  duas travas de integridade da proposta (uma pessoa por frente, uma frente por
  pessoa).
- `lib/auth/route-permissions.import-order.test.ts` (8): regressão do ciclo de
  import (§3.6), cobrindo COE, IA de Alocação, Risco e Score.

## 9. Evolução natural

1. **Skill por perfil planejado** — hoje a exigência técnica é do projeto inteiro
   (§3.4). Um vínculo `ProjectPlannedProfile ↔ Skill` diferenciaria as frentes
   tecnicamente, não só por senioridade.
2. **Atribuição ótima** (Hungarian) como alternativa ao guloso, quando o número
   de frentes crescer.
3. **Materializar a proposta em `Allocation`** com um passo explícito de
   confirmação humana — hoje o handoff é manual, por decisão.
4. **Escopo por linha** — hoje `PROJECT_MANAGER` e `SALES` enxergam nome,
   senioridade, área, skills validadas e disponibilidade de **todo** o quadro
   quando escolhem `scope=ALL`. O Mapa de Disponibilidade aplica recorte por
   linha (área/projeto/próprio); o COE ainda não, e aqui o gap é maior porque
   ampliar o escopo é um clique. `AREA_MANAGER` seguiria com escopo amplo, por
   falta de vínculo formal gestor→área no MVP.
5. **Deduplicar o fit no payload** — como todas as frentes compartilham a
   exigência técnica (§3.4), o mesmo `FitResult` é serializado uma vez por
   frente. Hoisting do fit para um índice por consultor cortaria o payload em
   ~N× no caso extremo (§3.3). Fica pendente porque o ganho só aparece em
   projetos no limite de frentes.
6. **`slotScore`/`slotLabel` são snapshot do cliente** — gravados como o
   proponente viu, por decisão: a troca manual é o ponto da tela, então
   recomputar no servidor brigaria com o override humano. O servidor valida o
   que importa (consultor existe e não está inativo, projeto existe e está
   aberto, uma pessoa por frente, score em 0..100). Uma verificação forte exigiria
   recompor a sugestão inteira no save.
