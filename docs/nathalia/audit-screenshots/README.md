# Nathal.IA — Screenshots da Validação ao Vivo

> Capturados em **2026-06-17** com Playwright (Chrome headless), viewport
> **1440×900**, login dev (Ana Martins, todos os papéis), `NEXT_PUBLIC_ENABLE_NATHALIA_3D=false`
> (experiência **padrão 2D** — o que a maioria dos usuários vê). Servidor em
> `localhost:3100`. Base de evidência do [`../AUDIT_REPORT.md`](../AUDIT_REPORT.md) §4-live.

## Índice

| Arquivo | Tela | O que mostra |
| --- | --- | --- |
| `00-login.png` | `/login` | Login Playful Ops; **sem Nathal.IA** (correto, só em `/app/*`). Disco "N" no canto = indicador de dev do Next.js. |
| `01-root.png` / `02-app.png` | `/` → `/app` | Launcher operacional ("O que você quer fazer agora?"). |
| `03-horas.png` | `/app/horas` | Timesheet semanal. |
| `04-projetos.png` | `/app/projetos` | Lista de projetos. |
| `05-aprovacoes.png` | `/app/aprovacoes` | Fila de aprovação. |
| `06-relatorios.png` | `/app/relatorios` | Relatórios (página alta, ~3359px). |
| `07-dev-nathalia.png` | `/app/dev/nathalia` | **Nathal.IA Lab** — avatar 2D renderiza inline aqui (face simples, esquemática); controles de estado/contexto/cérebro/proativo/posicionamento. |
| `09-panel-open-fullpage.png` | `/app/horas` | Viewport **após** abrir o painel via clique real — **o painel NÃO aparece**. |
| `11-panel-after-question.png` | `/app/horas` | Único overlay que pinta: o **tour** (disparado por "Como lançar horas?"), com o avatar 2D simples. |
| `V1-horas-closed-viewport.png` | `/app/horas` | Viewport com widget fechado — **launcher ausente** no canto inferior direito. |
| `V2-horas-panel-open-viewport.png` | `/app/horas` | Viewport com painel "aberto" — **idêntico ao V1**: nada aparece. |
| `_run-log.txt` | — | Log da execução (status HTTP + contagem do launcher por rota). |

## Achado crítico (medido, não inferido)

O widget flutuante existe no DOM em todas as rotas (`launcherCount=1`), mas é
**invisível na viewport**. Geometria medida via `getBoundingClientRect` (scroll 0):

| Rota | Altura do doc | Y do launcher | Na viewport? |
| --- | --- | --- | --- |
| `/app` | 900px | **900px** | ❌ |
| `/app/horas` | 1493px | **1493px** | ❌ |
| `/app/relatorios` | 3359px | **3359px** | ❌ |

O `y` do launcher **é exatamente a altura do documento** em todas as telas, sem
nenhum ancestral com `transform/filter/will-change/contain`. Estilo computado do
container `fixed`: `position: fixed` mas `top: 1493px; bottom: -685px; right: 818.9px; left: 0`.

**Causa-raiz:** as classes Tailwind arbitrárias
`[bottom:max(1rem,env(safe-area-inset-bottom))]` e `[right:max(1rem,env(safe-area-inset-right))]`
**não geram CSS** (provável incompatibilidade da sintaxe `env()` aninhado em
`max()` dentro de propriedade arbitrária no build atual). Sem `inset` efetivo, o
elemento `fixed` cai na sua **posição estática** (fim do fluxo do `body`, onde o
portal o injeta) = rodapé do documento → fora da viewport.

> O componente do avatar **funciona** (aparece inline no Lab e no tour); o que
> está quebrado é o **posicionamento do widget na viewport**. `build`/`test`/
> `typecheck` não pegam isso porque é uma classe utilitária que silenciosamente
> não compila, não um erro de tipo/teste.

## Validação da correção de visibilidade — `v3-fix/` (Fase 8.3, 2026-06-18)

Recaptura após corrigir o launcher que renderizava **fora da viewport** (classes
Tailwind de inset com `env()`/`max()` não compilavam → `fixed` sem `bottom`/`right`).
Correção: insets inline `style={{ bottom: "1rem", right: "1rem" }}` em
`NathaliaWidget.tsx`.

- Script repetível: `scripts/nathalia/capture_widget_shots.mjs` (Playwright,
  viewport 1440×900, login dev). Rodar com o dev server ativo:
  `SHOT_BASE_URL=http://localhost:3000 node scripts/nathalia/capture_widget_shots.mjs`.
- Resultado: **launcherCount=1 e inViewport=true em todas as 6 rotas**
  (`/app`, `/app/horas`, `/app/projetos`, `/app/aprovacoes`, `/app/relatorios`,
  `/app/dev/nathalia`), box consistente em `(1332, 792) 92×92` — canto inferior
  direito, dentro da tela.
- O servidor validado estava com **3D ligado**, então as capturas mostram o
  avatar **3D `master_v3`**; a correção de posicionamento vale igual para 2D e 3D.
- Arquivos: `<rota>.png` (página) + `<rota>-launcher.png` (recorte do launcher).
