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

## 11. Rodada 5 - Auth local (email/senha) + Convites + Grupos de Acesso

Status: DECISAO ARQUITETURAL. Esta secao define o desenho; a implementacao
sera feita pelos agentes `jump-data-modeler` (schema) e
`jump-fullstack-engineer` (codigo). Rodada sensivel a seguranca: as regras aqui
sao conservadoras e devem ser respeitadas a risca.

### 11.0 Decisoes de produto ja fixadas (registro, nao rediscussao)

- Login por email/senha como provider local de primeira classe.
- Sem cadastro publico. A entrada na plataforma se da SOMENTE por convite.
- Apenas `ADMIN` cria convites e altera papeis/status de usuarios.
- O primeiro `ADMIN` e provisionado por bootstrap via env (seed idempotente).
- O provider Microsoft Entra ID PERMANECE disponivel (nao remover). Email/senha
  e Entra coexistem; a escolha por deployment e por env.

### 11.1 Split edge/node (CRITICO)

Problema: o Credentials provider precisa de Prisma + hashing (Node-only). Se ele
entrar em `auth.config.ts`, o `proxy.ts` (que roda no Edge Runtime) passaria a
importar codigo Node-only e quebraria o build/runtime do middleware. O padrao
oficial do NextAuth v5 separa configuracao edge-safe da instancia completa.

Contrato (obrigatorio):

- `auth.config.ts` PERMANECE edge-safe. Mantem APENAS providers sem dependencia
  Node (hoje: Entra ID condicional a env) e os callbacks `authorized`/`jwt`/
  `session`. NUNCA importar Prisma, `node:crypto`, transporte de email, nem o
  modulo de hashing aqui. Continua `satisfies NextAuthConfig`.
- `auth.ts` (Node) e o UNICO lugar onde o Credentials provider entra:

  ```ts
  // auth.ts (Node runtime; pode importar Prisma + hashing)
  import NextAuth from "next-auth";
  import Credentials from "next-auth/providers/credentials";
  import { authConfig } from "./auth.config";

  export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
      ...authConfig.providers, // Entra (edge-safe) preservado
      Credentials({ /* authorize() usa Prisma + verify de senha */ }),
    ],
  });
  ```

- `proxy.ts` PARA de reexportar `auth` de `@/auth`. Ele passa a construir a
  PROPRIA instancia edge a partir SOMENTE de `authConfig`:

  ```ts
  // proxy.ts (Edge runtime; jamais toca Node-only)
  import NextAuth from "next-auth";
  import { authConfig } from "@/auth.config";

  export const { auth: proxy } = NextAuth(authConfig);

  export const config = { matcher: ["/app/:path*"] };
  ```

  Assim o middleware so conhece a config edge-safe (sem Credentials/Prisma) e
  continua decidindo acesso pelo callback `authorized` (presenca de sessao). A
  verificacao de senha so ocorre na instancia Node, no fluxo de `signIn`.

Arquivos afetados nesta decisao:

- `apps/web/src/auth.config.ts` - inalterado em essencia (segue edge-safe; nao
  recebe Credentials).
- `apps/web/src/auth.ts` - passa a montar `providers` com spread + Credentials.
- `apps/web/src/proxy.ts` - deixa de reexportar `auth`; cria instancia edge
  propria a partir de `authConfig` (`NextAuth(authConfig).auth`).
- Novo modulo Node-only de hashing (ver 11.3), importado SOMENTE por `auth.ts`
  e pelo seed/admin actions - NUNCA por `auth.config.ts` ou `proxy.ts`.

Invariante de revisao: qualquer import de Prisma/`node:crypto`/hashing dentro de
`auth.config.ts` ou `proxy.ts` e um defeito de seguranca/arquitetura.

### 11.2 Onde os papeis carregam

Confirmado e mantido: os papeis autoritativos para RBAC continuam sendo
carregados em `getCurrentUser()` -> `syncUserFromAuth()` (Node, server
components/actions), a partir das tabelas `User`/`Role`. NAO mover essa logica
para o callback `session`, que e avaliado tambem no Edge (via `auth()` usado
pelo proxy) e nao deve tocar Prisma.

Contrato do Credentials `authorize`:

- Recebe `{ email, password }`, normaliza email (`trim().toLowerCase()`),
  carrega o `User` por email, verifica status `ACTIVE` e `passwordHash`.
- Em sucesso retorna `{ id: user.id (cuid do banco), email, name }`. NAO retorna
  papeis (papeis NUNCA trafegam pelo token como fonte de verdade).
- `token.sub` recebe `user.id`. O callback `jwt`/`session` continua sem
  provisionar papeis reais (mantem `roles: []` no token).
- `getCurrentUser()` resolve o usuario por email (chave natural) e usa os papeis
  PERSISTIDOS. O `id` retornado e o cuid persistido (ja e o comportamento atual
  com `syncUserFromAuth`).

Isso vale igualmente para Entra futuro: ambos os providers convergem para a
mesma fonte de verdade de papeis (banco), pela mesma `getCurrentUser()`. A
diferenca entre providers fica isolada no `authorize`/OAuth, nunca no RBAC.

### 11.3 Hashing de senha

Decisao: usar `node:crypto` `scrypt` (KDF nativo do Node). Zero dependencia
nova, alinhado ao ADR13 (evitar peso/superficie de CVE de SDKs). `bcryptjs`
(alternativa pura-JS) foi descartado: traz dependencia adicional e ganho
marginal frente a um KDF padronizado ja disponivel no runtime.

PROIBIDO crypto caseiro (nada de `sha256(senha)`, sem salt, ou comparacao com
`===`). Usar exclusivamente `scrypt` + `randomBytes` + `timingSafeEqual`.

Parametros e formato (modulo Node-only, ex.: `lib/auth/password.ts`):

- Salt: `randomBytes(16)` por senha (aleatorio, unico).
- KDF: `scrypt(password, salt, keylen=64, { N: 16384, r: 8, p: 1 })`
  (N=2^14, custo padrao recomendado; ajustavel sem migracao por estar embutido
  no formato).
- Formato armazenado em `User.passwordHash` (string unica, auto-descritiva):
  `scrypt$N$r$p$<saltBase64url>$<hashBase64url>`.
  Exemplo: `scrypt$16384$8$1$<salt>$<hash>`. Os parametros viajam no proprio
  hash, permitindo evoluir custo/algoritmo sem quebrar hashes antigos.
- Verificacao: parsear o formato, derivar com os MESMOS parametros e comparar
  com `crypto.timingSafeEqual` (constante no tempo). Hashes de tamanho diferente
  retornam falso sem comparar (evita excecao do `timingSafeEqual`).
- Politica minima de senha (validada por Zod, server-side): minimo 10
  caracteres. Sem regras de composicao complexas (evita senhas previsiveis); o
  comprimento e o fator dominante.

`passwordHash` e `String?` (nullable) em `User`: usuarios criados via Entra ou
convites ainda nao aceitos nao tem senha. Login por credenciais exige
`passwordHash != null` e status `ACTIVE`.

### 11.4 Token de convite

Modelo: novo `UserInvitation`. O token e um segredo entregue UMA vez; o banco
guarda SOMENTE o hash.

Contrato:

- Geracao: `randomBytes(32)` -> base64url (>=256 bits de entropia). Esse e o
  token "claro", entregue ao admin/email UMA unica vez.
- Persistencia: armazena-se SOMENTE `tokenHash = sha256(tokenClaro)` (hex/base64)
  em `UserInvitation.tokenHash` (com `@unique`). sha256 e adequado aqui porque o
  token ja tem alta entropia (nao e senha de baixa entropia; nao precisa KDF
  lento). O token claro NUNCA e persistido.
- Single-use + TTL: `expiresAt = now + INVITE_TOKEN_TTL_HOURS` (env, default 72).
  Estados em `InvitationStatus`: `PENDING | ACCEPTED | EXPIRED | REVOKED`.
- Aceite (`/convite/<token>` ou form que recebe o token): server action
  re-hash do token recebido, busca por `tokenHash`, valida status `PENDING` e
  `expiresAt > now`. Em sucesso: cria/ativa o `User` com o email do convite,
  define `passwordHash` (senha escolhida no aceite), aplica os papeis previstos
  no convite, e marca o convite `ACCEPTED` (transacao unica). Convite expirado
  e tratado/marcado `EXPIRED`.
- Seguranca de log: o token claro NUNCA e logado em producao. Sem provider de
  email configurado (`EMAIL_PROVIDER=console`), o link de aceite e exibido
  SOMENTE ao `ADMIN` na resposta da action (UI), com aviso explicito de copiar e
  repassar por canal seguro. Com provider real (ADR12/ADR13, `EmailTransport`),
  o link vai por email e nao aparece na UI.
- Reenvio/revogacao: reenviar gera NOVO token (novo hash, novo `expiresAt`) e
  invalida o anterior. Revogar muda status para `REVOKED` (aceite passa a falhar
  por status).

Campos sugeridos (`jump-data-modeler` decide nomes finais): `id`, `email`
(normalizado), `tokenHash @unique`, `status`, `roles` previstos (via tabela de
juncao ou Json validado), `invitedByUserId` (FK actor), `expiresAt`,
`acceptedAt?`, `acceptedUserId?`, `createdAt`. Indices em `email` e `status`.

### 11.5 Bootstrap do primeiro ADMIN

Via env, no seed idempotente (`packages/database` seed):

- `BOOTSTRAP_ADMIN_EMAIL` (obrigatorio para o bootstrap rodar),
  `BOOTSTRAP_ADMIN_NAME` (default a partir do email),
  `BOOTSTRAP_ADMIN_PASSWORD` (OPCIONAL).
- Idempotencia: `upsert` por email. Garante o `User` ACTIVE e garante o vinculo
  `UserRole` ADMIN (sem duplicar se ja existir). Rodar o seed N vezes nao cria
  segundo admin nem altera senha existente.
- Com `BOOTSTRAP_ADMIN_PASSWORD`: grava `passwordHash` (via modulo de hashing
  11.3). Em producao, recomenda-se NAO usar senha em texto plano em env de longo
  prazo (trocar apos primeiro login). O seed nunca loga a senha.
- Sem `BOOTSTRAP_ADMIN_PASSWORD`: cria um `UserInvitation` PENDING para o admin
  (papel ADMIN) e imprime SOMENTE uma mensagem segura (ex.: "convite admin
  criado; recupere o link via fluxo de convites"). O token claro NAO vai para o
  log em producao; em ambiente nao-produtivo pode ser exibido para facilitar o
  primeiro acesso (mesma regra de 11.4).

### 11.6 Guarda do ultimo ADMIN (invariante de servidor)

Regra: NUNCA permitir que o sistema fique sem nenhum `ADMIN` ativo.

- Aplicada na server action que altera papeis e na que altera status do usuario
  (camada Node, apos `requireRole(["ADMIN"])`).
- Checagem: ao remover o papel ADMIN de um usuario, ou ao desativar
  (`status = INACTIVE`) um usuario que e ADMIN, contar ADMINs ativos
  EXCLUINDO o alvo (`count(User where status=ACTIVE and roles contains ADMIN and
  id != target)`). Se o resultado for 0, REJEITAR a operacao com erro de dominio
  ("nao e possivel remover/desativar o ultimo administrador ativo").
- Executar a verificacao DENTRO da mesma transacao da mutacao (evitar corrida
  entre dois admins se desativando simultaneamente).
- Vale tambem para auto-acao: um ADMIN nao pode rebaixar a si mesmo se for o
  ultimo.

### 11.7 Dev auth vs producao (precedencia)

`isDevAuthEnabled()` permanece como esta (secao 4.1): so ativo com
`AUTH_DEV_MODE=true` e fora de producao (ou com o escape hatch explicito
`ALLOW_DEV_AUTH_IN_PRODUCTION=true`, para preview sem provider). Em producao
real o modo dev fica OFF e o login usa Credentials e/ou Entra.

Como desligar com seguranca em producao: nao definir `AUTH_DEV_MODE` (ou
defini-la como `false`) e nunca definir `ALLOW_DEV_AUTH_IN_PRODUCTION` em
deployment com dados reais.

Ordem de precedencia na tela de login (`/login`), ampliando o `LoginVariant`
atual:

1. `dev` - se `isDevAuthEnabled()`.
2. `credentials` - se houver banco configurado (`isDatabaseConfigured()`), que
   habilita login email/senha. (Pode coexistir com Entra: mostrar ambos.)
3. `entra` - se `isEntraConfigured()` (exibido junto de credentials quando
   ambos disponiveis).
4. `unconfigured` - nenhum dos acima: aviso "autenticacao nao configurada".

Resumo da precedencia: dev > credentials > entra > unconfigured (com
credentials e entra podendo aparecer simultaneamente fora do modo dev).

### 11.8 Auditoria (AuditEvent)

Reusar `AuditEvent` (actor = `actorUserId`, `entityType`/`entityId`/`action`,
`before`/`after` Json). Eventos a auditar nesta rodada:

- Convite: `INVITATION_CREATED`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED`
  (actor do aceite e o proprio convidado; registrar `email`/`invitationId`).
- Papeis: `ROLE_GRANTED` / `ROLE_REVOKED` (before/after com os papeis).
- Status: `USER_STATUS_CHANGED` (before/after `ACTIVE`/`INACTIVE`).

NAO auditar cada login (volume alto, baixo valor; ruido em `AuditEvent`).
Recomendacao: tentativas de login falhas e logins ficam para observabilidade
(logs/metricas), nao para a trilha de auditoria de dominio. Auditar SEMPRE o
ciclo de convite e mudancas de papel/status, que sao as acoes sensiveis.

### 11.9 Resumo de impacto no schema (para jump-data-modeler)

- `User`: adicionar `passwordHash String?` (formato 11.3). `status` ja existe
  (`UserStatus ACTIVE|INACTIVE`).
- Novo `UserInvitation` + enum `InvitationStatus`
  (`PENDING|ACCEPTED|EXPIRED|REVOKED`), com `tokenHash @unique` (so o hash),
  papeis previstos, `invitedByUserId`, `expiresAt`, indices em `email`/`status`.
- `AuditEvent` reutilizado sem mudanca estrutural.
- Nada de acoplamento a Supabase: hashing por `node:crypto`, convite por token
  proprio, email por `EmailTransport` (ADR12/ADR13). Migravel para Render sem
  reescrita.

## 12. Operacao: primeiro acesso e go-live (Rodada 5)

Procedimento de primeiro acesso do ADMIN (resolve o chicken-and-egg do
bootstrap sem senha):

- O seed cria o ADMIN bootstrap (`BOOTSTRAP_ADMIN_EMAIL`) com role ADMIN e,
  sem `BOOTSTRAP_ADMIN_PASSWORD`, um convite `PENDING` (so o hash do token e
  guardado; o token nunca e impresso). Caminhos para o primeiro login:
  1. **Com senha**: rodar o seed com `BOOTSTRAP_ADMIN_PASSWORD` definido. O
     ADMIN ja loga por credenciais (forcado a trocar a senha — ver nota sobre
     `mustChangePassword`). Preferir nao manter senha em texto em env de longa
     duracao; rotacionar apos o primeiro acesso.
  2. **Por convite via dev-auth**: enquanto a producao de validacao roda com
     `AUTH_DEV_MODE`/`ALLOW_DEV_AUTH_IN_PRODUCTION`, qualquer acesso entra como
     DEV_USER (todas as roles). Use isso UMA vez para abrir
     `/app/admin/acessos`, **regenerar** o link do convite do ADMIN e aceita-lo
     (definindo a senha). Depois desligue o dev-auth.

Checklist de go-live (sair do dev-auth):

- Desligar `ALLOW_DEV_AUTH_IN_PRODUCTION` **e** `AUTH_DEV_MODE` em producao e,
  no MESMO deploy, ativar `AUTH_CREDENTIALS_ENABLED=true` com pelo menos um
  ADMIN que tenha senha definida (senao ninguem loga). Enquanto o hatch dev
  estiver ligado, toda a tela de acessos e operavel por anonimos — nao deixar
  ligado com dados reais.
- Fixar `NEXT_PUBLIC_APP_URL` para que os links de convite usem o host correto
  (sem depender de `x-forwarded-host`).

Dividas conscientes registradas:

- `mustChangePassword` e gravado (bootstrap/aceite podem setar) mas ainda NAO e
  imposto no login — forcar a troca e uma evolucao futura.
- Login por credenciais equaliza o tempo de resposta (uma verificacao scrypt
  sempre, mesmo para usuario inexistente/inativo) para mitigar enumeracao por
  timing; o restante (lockout/rate-limit, recuperacao de senha, MFA) fica para
  rodada futura.
