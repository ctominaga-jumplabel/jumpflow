# Auth Foundation - JumpFlow

Status: a fundacao de autenticacao/autorizacao foi **implementada** com
Auth.js (v5) e provider Microsoft Entra ID via env, sessao JWT, middleware de
protecao de `/app/*`, camada de autorizacao (RBAC) isolada e um **modo de
desenvolvimento** explicito que dispensa credenciais reais. Ainda **nao** ha
banco de dados, adapter Prisma nem provisionamento real de papeis.

Este documento registra as opcoes avaliadas, a decisao implementada, o modelo
de papeis, a protecao de rotas e as decisoes pendentes.

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

## 4. Decisao Implementada

**Auth.js (NextAuth v5) com provider Microsoft Entra ID via env**, sessao JWT,
sem adapter de banco nesta rodada. A abstracao de sessao e o RBAC vivem no nosso
codigo, nao no provedor.

Justificativa:

- Mantem a auth desacoplada da regra de negocio (principio da arquitetura).
- Permite comecar com um provider e trocar/adicionar depois sem reescrever
  permissoes.
- Nao cria dependencia de Supabase Auth, preservando a migracao para Render.
- Custo baixo e bom encaixe com Next.js App Router e Server Actions.

Estrutura de arquivos implementada (em `apps/web/src`):

- `auth.config.ts`: configuracao edge-safe (provider condicional a env,
  `pages.signIn`, callback `authorized` para proteger `/app/*`, callbacks
  `jwt`/`session` para papeis). `isEntraConfigured()` indica se o provider tem
  todas as env vars.
- `auth.ts`: instancia central do Auth.js (`handlers`, `auth`, `signIn`,
  `signOut`).
- `proxy.ts`: protege `/app/:path*` reutilizando o callback `authorized`
  (convencao `proxy` do Next 16, sucessora de `middleware`).
- `app/api/auth/[...nextauth]/route.ts`: handlers de rota do Auth.js.
- `lib/auth/types.ts`: `AppUser` (desacoplado do provedor).
- `lib/auth/roles.ts`: `RoleName`, `ROLE_NAMES`, labels e `primaryRoleLabel`.
- `lib/auth/route-permissions.ts`: mapa central rota->papeis e funcoes puras
  `hasRole`, `canAccess`, `accessForPath`, `canAccessPath`.
- `lib/auth/dev.ts`: `isDevAuthEnabled()`, `DEV_USER`, cookie de logout dev.
- `lib/auth/current-user.ts`: `getCurrentUser()`.
- `lib/auth/guards.ts`: `requireUser()`, `requireRole()` (e reexporta
  `hasRole`).
- `lib/auth/actions.ts`: server actions `loginWithEntra`, `devLogin`, `logout`.
- `app/login/` e `app/access-denied/`: telas premium.

A decisao final de provider depende da confirmacao do ambiente corporativo
(ver secao 9). A estrutura ja permite trocar/adicionar provider sem reescrever
o RBAC.

## 4.1 Modo de Desenvolvimento (sem credenciais reais)

- Flag `AUTH_DEV_MODE=true` ativa o modo dev **somente** quando
  `NODE_ENV !== "production"`. Em producao a flag e ignorada — nao ha fallback
  silencioso.
- Em modo dev, `getCurrentUser()` retorna o `DEV_USER` (com todos os papeis,
  para que todas as telas sejam alcancaveis) e o middleware libera `/app/*`.
- O logout em modo dev grava um cookie (`jf_dev_logout`) que faz o usuario ser
  tratado como deslogado; o botao de login dev limpa o cookie.
- Em producao sem provider configurado, `/login` exibe um aviso claro de
  "autenticacao nao configurada" (sem botao funcional).

### Como rodar localmente

1. Copie `.env.example` para `.env` (ou `.env.local`).
2. Defina `AUTH_SECRET` (gere com `npx auth secret`).
3. Mantenha `AUTH_DEV_MODE="true"` e deixe as `AUTH_MICROSOFT_ENTRA_ID_*`
   vazias.
4. `npm run dev` e acesse `/login` -> "Entrar (ambiente de desenvolvimento)".

Para testar com Entra ID real: preencha as tres `AUTH_MICROSOFT_ENTRA_ID_*` e
defina `AUTH_DEV_MODE="false"`.

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

Estrategia implementada:

- **Proxy/middleware** (`apps/web/src/proxy.ts`) barra acesso nao autenticado a
  `/app/*` e redireciona para `/login` preservando `callbackUrl`.
- **Checagem no servidor** em Server Components/Actions para operacoes privadas
  via `requireUser`/`requireRole` (nao confiar apenas no proxy nem no cliente);
  ex.: `/app/financeiro` exige `requireRole(["ADMIN","AREA_MANAGER","FINANCE"])`.
- **Helper de sessao/autorizacao** centralizado (ex.: `requireUser()`,
  `requireRole(...)`) em uma camada de auth isolada, sem espalhar a logica.
- **RBAC por modulo e acao**, derivado do mapa da secao 5.
- Esconder/desabilitar na UI o que o papel nao pode acessar, mantendo a
  checagem real no servidor.

## 7. Usuario Atual e Dev User

- A UI consome `getCurrentUser()` (em `lib/auth/current-user.ts`); a topbar
  recebe um `AppUser` via props do layout do `/app` (server).
- O antigo `mock-data/user.ts` foi removido. O usuario mockado agora e o
  `DEV_USER` em `lib/auth/dev.ts`, usado **somente** quando `isDevAuthEnabled()`.
- Em producao com provider real, `getCurrentUser()` mapeia a sessao do Auth.js
  para `AppUser`. Papeis reais ainda nao sao provisionados (ver secao 8).

## 8. Concluido Nesta Rodada / Proximos Passos

Concluido:

1. Camada de auth isolada (sessao Auth.js + RBAC) sem acoplar regra de negocio.
2. Telas `/login` e `/access-denied` (institucionais, movimento contido).
3. Proxy de protecao de `/app/*` com `callbackUrl`.
4. Helpers `requireUser` / `requireRole` (aplicado em `/app/financeiro`).
5. `mockUser` substituido por `getCurrentUser()` + `DEV_USER` explicito.

Proximos passos:

- Provisionar papeis reais (Entra app roles/groups ou DB) no callback `jwt`.
- Persistir `User` e `Role` (quando a rodada de banco autorizar) e avaliar
  adapter Prisma para sessao em banco.
- Auditar mudancas de permissao.

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
