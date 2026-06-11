# Prompt - Rodada 5: Login/Senha, Convites e Grupos de Acesso

Planejamento gerado em 2026-06-11. Como ainda nao ha acesso/configuracao do
Microsoft Entra ID, a proxima etapa de go-live deve criar uma autenticacao
operacional propria com login/senha, convites e grupos/papeis de acesso,
mantendo o caminho aberto para Entra ID no futuro.

## Decisao de produto

- Comecar com login por email/senha.
- Criar fluxo de convite para novos usuarios.
- Criar/gerenciar grupos de acesso/papeis.
- O usuario solicitante deve ser provisionado como `ADMIN`.
- Entra ID fica postergado; a arquitetura deve continuar permitindo ativar
  Entra depois sem reescrever o RBAC.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/auth-foundation.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/backlog-refinado-consultor-operacoes.md
- docs/design-system.md
- packages/database/prisma/schema.prisma
- apps/web/src/auth.config.ts
- apps/web/src/lib/auth/roles.ts
- apps/web/src/lib/auth/current-user.ts
- apps/web/src/lib/auth/route-permissions.ts

Contexto:
O JumpFlow ja tem Auth.js v5 com Microsoft Entra ID preparado, dev auth e RBAC.
Mas o usuario ainda nao tem acesso/configuracao do Entra ID. Portanto vamos
implementar autenticacao local temporaria/operacional por email/senha, com
convites e gestao de grupos/papeis. O objetivo nao e remover Entra ID; e
adicionar um provider de credenciais seguro e um fluxo administravel.

Objetivo:
Executar a Rodada 5 - Login/Senha, Convites e Grupos de Acesso.

Sub-rodada 5.0 - Produto, seguranca e arquitetura:
- Use `jump-product-owner`, `jump-architect` e `jump-code-reviewer`.
- Confirmar decisoes:
  - Login por email/senha.
  - Cadastro publico NAO existe.
  - Usuario entra apenas por convite.
  - Apenas `ADMIN` pode convidar usuarios e alterar grupos/papeis.
  - Primeiro ADMIN deve ser criado por seed/bootstrap via env, sem tela publica.
  - Entra ID fica disponivel para futuro; nao remover provider Entra.
- Documentar em `docs/auth-foundation.md`.

Sub-rodada 5.1 - Modelo de dados:
- Use `jump-data-modeler`.
- Adicionar modelos/campos Prisma para credenciais e convites.
- Sugestao:
  - `User.passwordHash String?`
  - `User.emailVerifiedAt DateTime?`
  - `User.lastLoginAt DateTime?`
  - `User.mustChangePassword Boolean @default(false)` se fizer sentido.
  - `UserInvitation`:
    - `id`
    - `email`
    - `name`
    - `tokenHash`
    - `expiresAt`
    - `acceptedAt`
    - `invitedByUserId`
    - `createdUserId`
    - `status` ou campos suficientes para PENDING/ACCEPTED/EXPIRED/REVOKED
    - relacao com roles/grupos convidados.
- Para grupos/papeis:
  - se o catalogo `Role` atual for suficiente, usar `Role` como grupo de
    acesso do MVP.
  - se for necessario grupo customizado, propor `AccessGroup`, mas preferir nao
    adicionar se `Role` resolver.
- Criar migration aditiva.
- Seed/bootstrap:
  - adicionar envs para criar primeiro admin:
    - `BOOTSTRAP_ADMIN_EMAIL`
    - `BOOTSTRAP_ADMIN_NAME`
    - opcional `BOOTSTRAP_ADMIN_PASSWORD`
  - se `BOOTSTRAP_ADMIN_PASSWORD` nao for desejavel, criar convite inicial
    para esse email e imprimir apenas mensagem segura, nunca token em logs de
    producao.
  - O usuario solicitante deve ficar com role `ADMIN`.
- Nao commitar senha, hash real ou token.

Sub-rodada 5.2 - Auth.js Credentials Provider:
- Use `jump-fullstack-engineer`.
- Adicionar Credentials provider ao Auth.js.
- Manter Microsoft Entra ID provider condicional como esta.
- Usar hash de senha forte:
  - preferencia: `bcryptjs` ou `argon2` se compativel com ambiente/Vercel;
  - evitar crypto caseiro.
- Login deve:
  - normalizar email;
  - buscar usuario ativo;
  - validar hash;
  - carregar roles reais do banco;
  - atualizar `lastLoginAt`;
  - negar usuario inativo.
- Callbacks `jwt/session` devem carregar roles persistidas no banco para
  credenciais e, se possivel, para Entra futuro por email.
- `getCurrentUser()` deve retornar `AppUser` com roles reais.
- `AUTH_DEV_MODE` permanece para desenvolvimento, mas producao deve usar
  credenciais/Entra, nao dev auth.

Sub-rodada 5.3 - Fluxo de convite:
- Use `jump-fullstack-engineer`, `jump-frontend-ux`, `jump-design-system`.
- Criar tela protegida para ADMIN:
  - sugestao `/app/admin/acessos`
  - lista de usuarios;
  - lista de convites pendentes;
  - formulario para convidar usuario: nome, email, roles/grupos.
- Criar fluxo de aceitar convite:
  - rota publica `/convite/[token]` ou `/accept-invite?token=...`;
  - validar token via hash;
  - validar expiracao/status;
  - usuario define senha;
  - criar/ativar usuario e roles;
  - marcar convite como aceito;
  - redirecionar para login.
- Envio de convite:
  - se email provider real estiver configurado, enviar email;
  - se nao estiver, exibir link de convite somente para ADMIN em ambiente de
    validacao, com aviso claro. Nao logar token em producao.
- Permitir revogar/reenviar convite se baixo risco.

Sub-rodada 5.4 - Grupos/papeis de acesso:
- Usar `Role` como grupo de acesso no MVP:
  - ADMIN
  - CONSULTANT
  - PROJECT_MANAGER
  - AREA_MANAGER
  - FINANCE
  - PEOPLE
  - SALES
- Tela ADMIN deve permitir:
  - ver roles de cada usuario;
  - alterar roles;
  - bloquear/desbloquear usuario (`User.status`);
  - impedir que o ultimo ADMIN ativo perca role ADMIN ou seja desativado.
- Auditar alteracoes de roles/status com `AuditEvent`.
- Atualizar documentacao chamando roles de "grupos de acesso" na UI se isso
  ficar mais claro para o usuario.

Sub-rodada 5.5 - UI de login:
- Atualizar `/login` para oferecer email/senha quando Credentials provider
  estiver configurado.
- Manter variantes:
  - login local;
  - Entra ID se configurado;
  - dev auth apenas quando permitido;
  - mensagem clara quando auth nao configurada.
- Adicionar mensagens seguras:
  - credenciais invalidas genericas;
  - usuario inativo;
  - convite expirado/revogado.
- Nao revelar se email existe em fluxos publicos.

Sub-rodada 5.6 - Env, docs e deploy:
- Atualizar `.env.example`.
- Sugerir envs:
  - `AUTH_CREDENTIALS_ENABLED=true`
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_NAME`
  - `BOOTSTRAP_ADMIN_PASSWORD` ou fluxo alternativo de convite bootstrap
  - opcional `INVITE_TOKEN_TTL_HOURS=72`
- Documentar como criar o primeiro admin.
- Documentar como desligar dev auth em producao.
- Nao imprimir secrets.

Sub-rodada 5.7 - QA/revisao/deploy:
- Use `jump-qa-engineer`:
  - login senha feliz/erro;
  - usuario inativo bloqueado;
  - roles carregadas na sessao;
  - ADMIN acessa admin/acessos;
  - nao ADMIN bloqueado;
  - convite cria token hash, nao token puro;
  - aceitar convite expirado/revogado falha;
  - aceitar convite valido cria usuario/roles;
  - alterar roles audita;
  - nao permite remover/desativar ultimo ADMIN;
  - Entra provider nao regressa;
  - dev auth continua funcionando localmente conforme env.
- Use `jump-code-reviewer` com foco em seguranca.
- Use `jump-devops` para migration, seed/bootstrap, envs Vercel e smoke.

Fora do escopo:
- Microsoft Entra ID real.
- MFA.
- Recuperacao de senha completa por email, salvo se for simples e segura.
- SSO/social login.
- Organizacoes/multi-tenant.
- Politicas complexas de senha alem de minimo razoavel.

Criterios de pronto:
- Login por email/senha funcional.
- Cadastro publico inexistente.
- Convite ADMIN -> aceite -> senha -> usuario ativo funcional.
- Roles/grupos reais persistidos no banco e refletidos na sessao.
- Usuario solicitante provisionado como ADMIN via bootstrap/seed.
- Tela ADMIN de acessos funcional.
- Alteracoes sensiveis auditadas.
- Ultimo ADMIN protegido.
- `AUTH_DEV_MODE` pode ser desligado em producao sem bloquear acesso.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel validado se aplicavel.

Mensagem de commit sugerida:
`feat: add local auth invitations and access groups`

Ao final, reporte:
- migrations criadas/aplicadas;
- como criar/bootstrapar o primeiro admin;
- rota de login/convite/admin criada;
- env vars necessarias;
- quantidade de testes;
- validacoes executadas;
- deploy Vercel, se feito;
- pendencias para Entra ID/MFA.
```

## Observacao

Quando o Entra ID estiver disponivel, o login local pode continuar como fallback
administrativo ou ser desativado por env. O RBAC deve permanecer no banco do
JumpFlow.
