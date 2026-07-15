# Handshake M2M (Entra ID) — CRM-Jumplabel → JumpFlow (Fase 1)

> Fecha o **Ponto 1** da coordenação da integração (contrato v1 §1 / G6). É **config**, não código.
> O código do resource server é `apps/web/src/lib/integrations/crm/m2m-auth.ts`.

O JumpFlow expõe `POST /integrations/crm/projects` **fora** de `/app/*` e atua como **resource server** OAuth 2.0: valida o Bearer que o CRM obtém via **client-credentials** no Entra ID. A guarda valida, no token: assinatura **RS256** (via JWKS), `iss` (issuer **v2.0**), `aud` (exato) e a presença de uma **app-role** no claim `roles` (ou scope em `scp`).

## Valores acordados

| Papel | Valor | Onde |
|---|---|---|
| Application ID URI (audience) | `api://jumpflow-api` | App Registration da API do JumpFlow |
| App role (value) | `Crm.Projects.Ingest` | App role da mesma API, `allowedMemberTypes: ["Application"]` |
| Scope pedido pelo CRM | `api://jumpflow-api/.default` | env `JUMPFLOW_API_SCOPE` no CRM |
| Client de saída do CRM | `JUMPFLOW_CLIENT_ID` (App Registration dedicada do CRM) | recebe a role concedida |

> Os nomes acima são propostos; podem mudar, **desde que fiquem idênticos** nos 3 lugares: App Registration (Entra), env do JumpFlow (`CRM_M2M_*`) e o scope do CRM (`JUMPFLOW_API_SCOPE`).

## Passo a passo — lado JumpFlow (admin do tenant Entra)

1. **App Registration "JumpFlow API (M2M)"** — dedicada (separada do app de login de usuário).
   - **Expose an API → Application ID URI** = `api://jumpflow-api`.
   - **App roles → New app role**: Display name "CRM Projects Ingest", **Value** `Crm.Projects.Ingest`, **Allowed member types: Applications**.
   - **Manifest**: `"requestedAccessTokenVersion": 2`. ⚠️ **Sem isso o Entra emite token v1** (`iss = https://sts.windows.net/<tid>/`, `aud` = GUID) e a nossa guarda rejeita com `invalid_token`, porque exigimos `iss` no formato **v2.0**.
2. **Conceder a role ao app do CRM**: no App Registration de saída do CRM (`JUMPFLOW_CLIENT_ID`) → **API permissions → Add a permission → My APIs → JumpFlow API → Application permissions → `Crm.Projects.Ingest`** → **Grant admin consent**.

## Envs a semear no JumpFlow (Vercel — produção)

```
CRM_M2M_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
CRM_M2M_AUDIENCE=api://jumpflow-api
CRM_M2M_REQUIRED_ROLE=Crm.Projects.Ingest
# CRM_M2M_JWKS_URI  -> opcional; derivado de <issuer>/discovery/v2.0/keys
```

`CRM_M2M_ISSUER` pode ser omitido se `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` já estiver no runtime (a guarda deriva o issuer v2.0 dele) — mas **recomendamos setar explícito**. Enquanto essas envs não existirem, a guarda **nega** (comportamento correto: endpoint dormente).

## Verificação (determinística) do `aud`

O valor exato de `aud` num token v2 pode ser a Application ID URI **ou** o GUID do app da API, dependendo da config. Antes de fechar:
1. O CRM adquire um token com `JUMPFLOW_API_SCOPE=api://jumpflow-api/.default`.
2. Decodificar em https://jwt.ms e conferir: `iss` termina em `/v2.0`; `aud` == o que puser em `CRM_M2M_AUDIENCE`; `roles` contém `Crm.Projects.Ingest`.
3. Se o `aud` vier como GUID, ajuste `CRM_M2M_AUDIENCE` para esse GUID (deve bater **exatamente**).

## Teste ponta-a-ponta (após config)

- Sem token / token inválido / `aud` errada ⇒ **401**; role ausente ⇒ **403**; token válido+role ⇒ passa.
- 1º `project.won` ⇒ **200** `CREATED`; reenvio do mesmo `idempotencyKey` ⇒ **409** `DUPLICATE`; ajuste ⇒ `project.updated` (revisão nova) ⇒ **200** `UPDATED`; reversão ⇒ `CANCELLED`; re-ganho (revisão nova) ⇒ **reativa** para `ACTIVE`.
