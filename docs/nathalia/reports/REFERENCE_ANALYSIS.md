# Nathal.IA — Reference Analysis (`nathalia_tripo_v02.glb`)

> Análise técnica e visual da **referência aprovada** (`VISUAL_REFERENCE_APPROVED`).
> Insumo da Fase 5 (Master Character Build). A v02 é tratada **apenas** como
> referência de likeness, proporções, silhueta e roupa — **nunca** é promovida a
> master (ver [`MASTER_CHARACTER_STRATEGY.md`](../MASTER_CHARACTER_STRATEGY.md)).
>
> Gerado a partir de medição real no Blender 5.1.2 (`inspect_glb.py`) e do canon
> em [`CHARACTER_SHEET_PREMIUM.md`](../CHARACTER_SHEET_PREMIUM.md) /
> [`CHARACTER_BIBLE.md`](../CHARACTER_BIBLE.md).
>
> Última atualização: **2026-06-16**.

---

## 1. Medições objetivas (Blender 5.1.2)

| Métrica | Valor medido | Orçamento `master.glb` | Veredito |
| --- | --- | --- | --- |
| Tamanho do arquivo | **57,1 MB** | ≤ 1,5 MB | ❌ ~38× acima |
| Triângulos | **1.931.376** | ≤ 25.000 (MVP) · 60k (hard) | ❌ ~77× acima do MVP |
| Vértices | **1.129.131** | — | ❌ inviável p/ web |
| Objetos | 1 | 7 nomeados | ❌ blob único |
| Meshes | 1 | 7 | ❌ |
| Materiais | 1 | 7 (`MAT_*`) | ❌ |
| Imagens/texturas | 3 (embutidas) | ≤ 4, 1024² | ⚠️ ok em número, tamanho a medir |
| Rig | **não** | Armature 16 bones | ❌ ausente |
| Shape keys | **não** | 7 | ❌ ausente |
| Animações | **não** | 8 actions | ❌ ausente |
| Bounding box (un. Blender) | x=0,2108 · y=0,6773 · z=0,9801 | altura ~1,60 m | ⚠️ precisa reescala + reorientação |

**Leitura:** a v02 é uma malha de captura/geração densa, sem nenhuma estrutura de
produção. É excelente como **escultura de referência**, e impossível de usar como
ativo de runtime — confirma o caminho de **reconstrução game-ready** decidido no
intake (Caminho 1).

---

## 2. Proporções observadas

- Razão altura:largura ≈ **0,98 : 0,21 ≈ 4,6 : 1**, coerente com o canon de
  **4,5 cabeças de altura** (figura estilizada compacta) do
  [`CHARACTER_SHEET_PREMIUM.md`](../CHARACTER_SHEET_PREMIUM.md) §Proporções.
- Silhueta esbelta, braços próximos ao corpo (largura X pequena) — a referência
  está perto de uma pose neutra, **não** em A-Pose larga. O master adota **A-Pose
  leve (~30°)** para facilitar rig/skinning (decisão do canon, não da referência).
- Profundidade (Y ≈ 0,68) relativamente alta: inclui o **volume do cabelo**
  caindo nas costas + caimento da roupa — consistente com "cabelo longo soma à
  silhueta", não ao crânio.

---

## 3. Elementos APROVADOS (a preservar no master)

- **Likeness geral / vibe**: mulher jovem-adulta estilizada, amigável e
  profissional (registro Pixar/Notion-like) — aprovado como direção.
- **Silhueta**: cabeça levemente maior, cabelo longo escuro emoldurando o rosto,
  tronco compacto — o "marcador nº 1" de leitura em tamanho pequeno.
- **Roupa**: camiseta escura + calça escura casual + tênis claros — exatamente a
  fantasia canônica. A referência confirma o caimento solto-confortável.
- **Proporção 4,5 cabeças**: validada pela razão de bounding box.

## 4. Elementos REJEITADOS (não trazer para o master)

- **Densidade de malha** (1,93 M tris): descartada integralmente — o master é
  reconstruído dentro do orçamento, não decimado.
- **Objeto/material únicos**: rejeitados — o master separa 7 objetos e 7
  materiais nomeados.
- **Escala/orientação do arquivo**: a v02 não está em metros nem normalizada
  (pés no chão / olhar -Z); o master nasce normalizado.
- **Texturas de captura** (3 imagens pesadas): não reaproveitadas como estão;
  o master usa materiais PBR estilizados foscos (cor sólida + leve variação).
- **Ausência de topologia facial**: a referência não tem loops de boca/pálpebra;
  shape keys precisam de topologia nova (Etapa 2/6 do build plan).

---

## 5. Diferenças para o Character Bible / Sheet

| Aspecto | Referência v02 | Canon (Bible/Sheet) | Ação no master |
| --- | --- | --- | --- |
| Pose | quase neutra, braços fechados | A-Pose leve ~30° | reconstruir em A-Pose |
| Estrutura | blob único | 7 objetos + rig + shapes + actions | reconstruir do zero |
| Logo `jump` | não legível como decal próprio | wordmark branco, material `MAT_Logo` dedicado | objeto/decal separado |
| Cores | texturas de captura | paleta oficial (`#111814`, `#241f2b`, `#f3c6a3`…) | materiais canônicos |
| Escala | ~0,98 un, não-métrica | 1,60 m, pés em (0,0,0), olhar -Z | normalizar |
| Orçamento | 57 MB / 1,93 M tris | ≤ 1,5 MB / ≤ 25k tris | reconstrução low-poly |

**Conclusão:** a v02 confirma a **direção visual** e as **proporções**, e por isso
é a referência oficial — mas tudo que é estrutura de produção (topologia, escala,
separação, rig, expressões, animação, materiais) precisa ser **construído**, não
extraído. Isso fundamenta a estratégia no documento seguinte.
