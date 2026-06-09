# Auth Foundation - JumpFlow

Documento de preparacao para a proxima rodada (Auth Foundation). Nesta etapa
**nao** implementamos autenticacao real: o objetivo e registrar opcoes,
recomendacao provisoria, modelo de papeis, estrategia de protecao de rotas e
decisoes pendentes, para que a implementacao comece com direcao clara.

Fontes de verdade relacionadas:

- Arquitetura: `docs/arquitetura.md` (ADR de auth desacoplada).
- Modelo de dados: `docs/modelo-dados.md` (entidades `User` e `Role`).
- Backlog: `docs/backlog-mvp.md` (EP01 - Autenticacao e Perfis).

## 1. Contexto Atual

- O app shell ja existe em `apps/web/src/app/app/` com navegacao, topbar e
  dashboard mockado.
- Nao ha autenticacao nem conexao com banco.
- Existe um usuario mockado em `apps/web/src/lib/mock-data/user.ts`
  (`mockUser`), usado apenas para renderizar a topbar.
- O nome do produto e configuravel por `NEXT_PUBLIC_APP_NAME`
  (`apps/web/src/config/app.ts`).

## 2. Principios

Herdados de `docs/arquitetura.md`:

- Manter autenticacao desacoplada da regra de negocio.
- Evitar acoplar permissoes exclusivamente ao provedor de auth.
- Validacao de permissao deve ocorrer sempre no servidor.
- RBAC no MVP, checado por modulo e acao.
- Campos financeiros protegidos por papel.
- Auditar alteracoes sensiveis (permissoes inclusas).

## 3. Opcoes de Autenticacao

### Microsoft Entra ID

- Pros: alinhado a um ambiente corporativo Microsoft 365; SSO; menor gestao de
  senhas; MFA gerenciado pela TI.
- Contras: depende de a Jump usar Microsoft 365; configuracao de tenant/app
  registration; acoplamento ao ecossistema Microsoft.

### Auth.js (NextAuth)

- Pros: open-source, sem fornecedor obrigatorio, integra bem com Next.js App
  Router; suporta multiplos providers (incluindo Entra ID) e credenciais;
  sessao via JWT ou database; baixo custo.
- Contras: mais codigo proprio para fluxos e RBAC; manutencao por nossa conta.

### Clerk

- Pros: rapido de integrar; UI pronta; gestao de usuarios/organizacoes; MFA.
- Contras: dependencia de SaaS externo; custo por usuario; dados de identidade
  fora da nossa base; risco de acoplamento.

### Supabase Auth

- Pros: ja teriamos Supabase Postgres no MVP; integrado ao banco.
- Contras: a arquitetura pede para **evitar** depender de recursos exclusivos do
  Supabase, pensando na migracao para Render; aumentaria o acoplamento.

## 4. Recomendacao Provisoria

**Auth.js (NextAuth) com provider de Entra ID quando confirmado o uso de
Microsoft 365**, mantendo a abstracao de sessao e RBAC no nosso codigo.

Justificativa:

- Mantem a auth desacoplada da regra de negocio (principio da arquitetura).
- Permite comecar com um provider e trocar/adicionar depois sem reescrever
  permissoes.
- Nao cria dependencia de Supabase Auth, preservando a migracao para Render.
- Custo baixo e bom encaixe com Next.js App Router e Server Actions.

Decisao final depende da confirmacao do ambiente corporativo (ver secao 9).

## 5. Modelo de Papeis (RBAC)

Papeis iniciais (de `docs/modelo-dados.md`, entidade `Role`):

- `ADMIN`
- `CONSULTANT`
- `PROJECT_MANAGER`
- `AREA_MANAGER`
- `FINANCE`
- `PEOPLE`
- `SALES`

Regras:

- Um usuario pode ter um ou mais papeis.
- O papel define os modulos e acoes acessiveis.
- Campos financeiros (valor hora, custo hora) restritos a `FINANCE`,
  `AREA_MANAGER` e `ADMIN`, conforme a regra de negocio.

### Mapa preliminar de acesso por modulo

Apenas orientativo; sera refinado na implementacao com `jump-product-owner`.

| Modulo        | Acesso de leitura tipico                          | Acoes sensiveis             |
| ------------- | ------------------------------------------------- | --------------------------- |
| Dashboard     | Todos (visao varia por papel)                     | -                           |
| Horas         | `CONSULTANT` (proprias)                           | Lancar/enviar               |
| Projetos      | `PROJECT_MANAGER`, `AREA_MANAGER`, `ADMIN`        | Dados financeiros (auditar) |
| Consultores   | `PEOPLE`, `AREA_MANAGER`, `SALES`, `ADMIN`        | Editar cadastro             |
| Skills        | `CONSULTANT` (proprias), `PEOPLE`, `SALES`        | Validar skill               |
| Certificados  | `CONSULTANT` (proprios), `PEOPLE`                 | Validar certificado         |
| Aprovacoes    | `PROJECT_MANAGER`, `AREA_MANAGER`, `ADMIN`        | Aprovar/reprovar            |
| Financeiro    | `FINANCE`, `AREA_MANAGER`, `ADMIN`                | Fechamento mensal (auditar) |

## 6. Protecao de Rotas

Estrategia planejada (a implementar na proxima rodada):

- **Middleware** (`apps/web/src/middleware.ts`) para barrar acesso nao
  autenticado a `/app/*` e redirecionar para login.
- **Checagem no servidor** em Server Actions e Route Handlers para toda
  operacao privada (nao confiar apenas no middleware nem no cliente).
- **Helper de sessao/autorizacao** centralizado (ex.: `requireUser()`,
  `requireRole(...)`) em uma camada de auth isolada, sem espalhar a logica.
- **RBAC por modulo e acao**, derivado do mapa da secao 5.
- Esconder/desabilitar na UI o que o papel nao pode acessar, mantendo a
  checagem real no servidor.

## 7. Usuario Mockado Atual

- Arquivo: `apps/web/src/lib/mock-data/user.ts`.
- Estrutura `MockUser`: `name`, `email`, `role`, `initials`.
- Uso atual: somente exibicao na topbar (`Topbar.tsx`).
- Na transicao: substituir por dados de sessao reais, mantendo um adaptador para
  que a UI continue lendo de uma mesma forma (ex.: `getCurrentUser()`), evitando
  espalhar a dependencia direta do mock.

## 8. Plano da Proxima Rodada (resumo)

1. Definir provider (ver decisoes pendentes).
2. Adicionar camada de auth isolada (sessao + RBAC) sem acoplar regra de
   negocio.
3. Criar tela de login (institucional; movimento permitido, ver design system).
4. Adicionar middleware de protecao de `/app/*`.
5. Criar helpers `requireUser` / `requireRole` e aplicar nas operacoes privadas.
6. Substituir `mockUser` por sessao real via adaptador.
7. Persistir `User` e `Role` (somente quando a rodada de banco autorizar).
8. Auditar mudancas de permissao.

## 9. Decisoes Pendentes

- Provedor de autenticacao definitivo (Entra ID vs Auth.js generico vs Clerk).
- A Jump usa Microsoft 365 como base corporativa?
- Estrategia de sessao (JWT stateless vs sessao em banco).
- Politica de MFA.
- Quando habilitar persistencia real de usuarios/papeis (depende da rodada de
  banco).
- Se havera multi-org/multi-tenant no futuro.

## 10. Regras a Respeitar Nesta Preparacao

- Nao implementar login real agora.
- Nao conectar ao Supabase nesta rodada.
- Nao alterar schema Prisma sem justificativa forte.
- Manter o nome configuravel por `NEXT_PUBLIC_APP_NAME`.
