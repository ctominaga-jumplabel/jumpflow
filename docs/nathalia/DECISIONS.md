# Nathal.IA — Decisões (ADR leve)

> Decisões arquiteturais da Nathal.IA, no estilo ADR enxuto. Cada decisão tem
> contexto, decisão e consequências. Atualize ao revisar uma decisão.

---

## D-001 — `master.glb` é a fonte única de verdade visual

**Contexto.** A personagem pode existir em várias formas (sheet, modelo base,
LODs, thumbnails, poses isoladas). Sem uma âncora, os artefatos divergem.

**Decisão.** O **`master.glb`** é a fonte de verdade. Todas as variantes (LODs,
poses, thumbnails) são **derivadas** dele por script, nunca editadas à mão.

**Consequências.** Mudanças visuais entram pelo `master.glb` e re-derivam o
resto. `export_variants.py` e `generate_thumbnails.py` partem sempre dele.

---

## D-002 — Blender é o pipeline de refinamento e geração de ativos

**Contexto.** Precisamos de rig, shape keys, materiais nomeados, controle de
topologia e exportação reprodutível — coisas que geradores image-to-3D não
entregam de forma confiável.

**Decisão.** O **Blender** é a fábrica de ativos: refina o modelo base, aplica
rig/shape keys/actions, normaliza e exporta o `master.glb`. A automação é via
linha de comando (`blender --background --python ...`).

**Consequências.** Scripts versionados em `scripts/nathalia/`. Pipeline
reprodutível e, no futuro, executável em CI. Ver [`BLENDER_AUTOMATION.md`](./BLENDER_AUTOMATION.md).

---

## D-003 — Tripo só para o modelo base

**Contexto.** Geradores como o Tripo são ótimos para um volume inicial rápido,
mas ruins para rig/topologia/nomes e criam lock-in se forem o pipeline inteiro.

**Decisão.** Usar **Tripo (ou similar) apenas para gerar `nathalia_base.glb`**.
Todo o resto é Blender.

**Consequências.** Baixo lock-in; o gerador pode ser trocado sem afetar o
pipeline de refinamento. A qualidade final não depende do gerador.

---

## D-004 — Sem binários grandes versionados nesta fase

**Contexto.** `.glb` e texturas incham o repositório e degradam clones.

**Decisão.** **Nenhum binário grande** (`.glb`, texturas, sheets pesadas) é
versionado nesta fase. Quando existirem, usar **Git LFS** ou **storage/bucket**.

**Consequências.** Apenas docs, specs, scripts e configs entram no Git agora.
Slots de assets permanecem vazios com README explicativo.

---

## D-005 — Sem dependência de three.js / React Three Fiber ainda

**Contexto.** Adicionar WebGL antes de existir um modelo só aumenta peso e
superfície de bug.

**Decisão.** **Não** adicionar `three`, `@react-three/fiber` ou `@react-three/drei`
nesta fase. O seam `canRender3D()` permanece retornando `false`.

**Consequências.** Bundle leve; avatar 2D/CSS continua sendo o renderizador. A
integração 3D é introduzida na **Fase 5**, sob `dynamic({ ssr:false })`.

---

## D-006 — Sem LLM conectada

**Contexto.** Conectar um modelo antes de ter tools reais e RBAC validado é
risco de segurança e de produto.

**Decisão.** **Nenhuma** chamada a LLM (OpenAI/Anthropic/etc.) nesta fase. As
respostas seguem mockadas e controladas.

**Consequências.** Toda a inteligência fica em dados/heurísticas locais. A LLM
entra na **Fase 7**, com tools sob `canExecuteAction` e autorização no servidor.

---

## D-007 — Avatar 2D/CSS continua como fallback permanente

**Contexto.** WebGL pode falhar (driver, `prefers-reduced-motion`, dispositivo
fraco, SSR) e o 3D carrega sob demanda.

**Decisão.** O avatar **2D/CSS** (`NathaliaAvatar.tsx`) é o **fallback
permanente**, não um estágio temporário. O 3D só substitui quando disponível e
saudável.

**Consequências.** A personagem nunca "some". O 2D precisa carregar a
personalidade (cores, expressão, microanimação) por conta própria.

---

## D-008 — Personagem inspirada, não reprodução realista

**Contexto.** A Nathal.IA homenageia a Nathalia (pessoa real), mas reproduzir
alguém realisticamente levanta questões de privacidade e tom.

**Decisão.** A Nathal.IA é **original e estilizada**, inspirada no papel e na
simpatia — **não** um retrato/deepfake de uma pessoa real.

**Consequências.** Direção visual caricata e profissional, com identidade
própria. Ver [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) §1.

---

## D-009 — Validação tolerante, reprovação só em violação dura

**Contexto.** Nomes de clipe/material podem divergir entre pacote e modelo
durante a evolução.

**Decisão.** A validação automática **reporta** divergências de nome (objetos,
materiais, animações, shape keys) mas só **reprova** em violações duras
(ex.: polycount acima do máximo, arquivo inválido).

**Consequências.** O pipeline não trava por diferenças cosméticas; a
reconciliação de nomes acontece na integração (Fase 5).

---

## ADR-010 — Um `.glb` bruto do Tripo precisa passar na validação técnica antes de virar `master.glb`

**Contexto.** Geradores image-to-3D (Tripo) produzem _sculpts_ densos: objeto
único, material único, texturas pesadas e arquivos enormes (o primeiro bruto da
Nathal.IA tem **54.5 MB**, ~36× o orçamento web). Promover um arquivo desses
direto a `master.glb` quebraria performance, rigging e a aplicação do logo. O
`master.glb` é a fonte de verdade (D-001) e dele tudo deriva — não pode ser um
bruto não validado.

**Decisão.** Todo `.glb` recebido entra primeiro por uma etapa formal de
**intake e validação técnica** (Fase 3A):

1. Chega como **raw candidate** em `assets/nathalia/raw/` (binário não
   versionado — D-004).
2. É medido e julgado por `scripts/nathalia/{inspect,validate}_glb.py` +
   `generate_asset_report.py`, que gera um relatório versionado em
   `assets/nathalia/reports/`.
3. Recebe uma decisão registrada em
   [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md): _aceitar para
   refinamento_, _aceitar como referência visual_, _rejeitar e regenerar_ ou
   _gerar nova Character Sheet_.
4. **Só vira `master.glb`** depois de cumprir o
   [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
   (todos os critérios obrigatórios) e ser **promovido** para
   `packages/character-nathalia/assets/models/master.glb`.

A bancada de intake (`assets/nathalia/`) é **separada** do pacote de runtime de
propósito: mantém o pacote limpo e o aceite explícito e auditável. O `master.glb`
publicado continua no pacote, conforme `ASSET_GUIDE.md` e o contrato de assets.

**Consequências.** Nenhum bruto é adotado por engano. O processo é reprodutível e
auditável (relatórios versionados). O custo é uma etapa extra antes do Blender,
compensada por evitar retrabalho e regressões de performance. O candidato atual
(`nathalia_tripo_raw.glb`) **não** está aprovado.
