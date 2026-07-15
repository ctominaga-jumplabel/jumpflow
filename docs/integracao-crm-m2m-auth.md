# Integração CRM-Jumplabel → JumpFlow — Autenticação M2M

> **Escopo:** guarda machine-to-machine (M2M) do endpoint de ingestão
> `POST /integrations/crm/projects` (contrato v1, Fase 1). Este endpoint fica
> **fora** de `/app/*` (não é coberto por `proxy.ts`); a guarda descrita aqui é
> o único gate.
>
> **Código:** `apps/web/src/lib/integrations/crm/m2m-auth.ts`
> (`authorizeCrmM2M`).

---

## Método primário — Segredo compartilhado (Bearer), sem Azure

O CRM autentica com um **segredo compartilhado** enviado no header
`Authorization: Bearer <segredo>`, comparado em **tempo constante** — o mesmo
padrão do `CRON_SECRET`/`job-auth.ts` deste repositório. Não é preciso Azure,
MSAL nem token provider: **o segredo é a credencial**.

### Passo a passo

1. **Gerar o segredo** (uma vez, valor forte e aleatório):

   ```bash
   openssl rand -base64 48
   ```

2. **Configurar o segredo nos dois lados** com o **mesmo valor**:
   - No JumpFlow (Vercel → Environment Variables): `CRM_M2M_SHARED_SECRET`.
   - No CRM (env de saída da integração): a variável equivalente que o CRM usa
     para montar o header `Authorization`.

3. **O CRM envia** cada chamada de ingestão com o header:

   ```http
   POST /integrations/crm/projects HTTP/1.1
   Host: <jumpflow>
   Authorization: Bearer <CRM_M2M_SHARED_SECRET>
   Content-Type: application/json; charset=utf-8
   ```

   Nada de MSAL/token provider — o CRM manda o segredo direto.

### Postura de segurança

- **HTTPS obrigatório** em trânsito (o segredo viaja no header).
- Comparação em **tempo constante** (`node:crypto` `timingSafeEqual`) — sem
  vazar tamanho/igualdade por timing.
- **O segredo é a credencial**: neste caminho não há checagem de app-role/scope.
- **Produção nunca abre sem credencial.** Um ambiente com segredo configurado
  **não abre silenciosamente** nem fora de produção quando o bearer está errado
  ou ausente ⇒ `401`.
- Rotação: gere um novo segredo, atualize os dois lados e faça redeploy.

### Ordem de avaliação da guarda

`authorizeCrmM2M` avalia, nesta ordem:

1. **`CRM_M2M_SHARED_SECRET`** setado **e** bearer confere (tempo constante) ⇒
   `{ ok: true, clientId: "crm-shared-secret" }`. Vale em **todos** os
   ambientes, **inclusive produção**.
2. **`CRM_M2M_DEV_SECRET`** (dev) — só fora de produção; ignorado em produção.
3. **Entra JWT** — se o caminho OAuth estiver configurado (ver abaixo).
4. **Nada casou:**
   - havia algo configurado (segredo e/ou Entra) mas o bearer não bateu ⇒
     `401 unauthorized`;
   - nada configurado **e** produção ⇒ `401 m2m_auth_not_configured`;
   - nada configurado **e** fora de produção ⇒ `{ ok: true, clientId: "dev-open" }`
     (conveniência local).

---

## Alternativa: Entra ID (OAuth client-credentials) — uso futuro

Mantida como caminho alternativo para quando houver acesso ao Azure. O JumpFlow
atua como **resource server**, validando o JWT que o CRM obtém via
client-credentials.

- **Registro de app (Entra):** expor a API com audience `api://jumpflow-api` e
  uma app role `Crm.Projects.Ingest` concedida ao app do CRM.
- **Token v2:** no manifesto do app da API, `requestedAccessTokenVersion: 2`
  (garante `iss`/`aud` no formato v2 esperado pela validação).
- **Envs:**
  - `CRM_M2M_ISSUER` — issuer OIDC (fallback: `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
    ou derivado de `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`).
  - `CRM_M2M_JWKS_URI` — opcional; default `<issuer>/discovery/v2.0/keys`.
  - `CRM_M2M_AUDIENCE` — `aud` esperado (ex.: `api://jumpflow-api`).
  - `CRM_M2M_REQUIRED_ROLE` — app role/scope obrigatória (ex.:
    `Crm.Projects.Ingest`). **Obrigatória em produção** neste caminho — sem ela,
    qualquer token do tenant com a `aud` correta passaria ⇒ tratado como
    misconfiguration e negado.
- **Assinatura:** validada com `RS256` (algoritmo fixado defensivamente).

Erros: token ausente ⇒ `401 missing_bearer_token`; inválido/expirado/`aud`
errada ⇒ `401 invalid_token`; role/scope ausente ⇒ `403 insufficient_scope`.

---

## Teste ponta a ponta esperado (contrato v1 §4)

Com a guarda liberando (segredo correto), o ciclo de vida do projeto deve se
comportar assim:

| Passo | Evento enviado | Resposta esperada |
|---|---|---|
| Ganho inicial | `project.won` | `200` · `result: CREATED` |
| Reenvio do mesmo `idempotencyKey` | `project.won` (idêntico) | `409` · `result: DUPLICATE` (CRM trata como sucesso) |
| Ajuste de escopo | `project.updated` (revision+1) | `200` · `result: UPDATED` |
| Reversão pós-ganho | `project.cancelled` | `200` · projeto marcado `CANCELLED` |
| Re-ganho após cancelamento | `project.won`/`project.updated` | `200` · reativa o projeto |

> O mapeamento `result → HTTP status` e a idempotência são responsabilidade da
> camada de ingestão (`ingest.ts` / route handler); esta guarda apenas decide
> **quem** pode chamar o endpoint.
