# Nathal.IA — Plano de Lip-Sync

## Estado atual (Fase 2D)

- **Visemas como assets 2D**: `vis-<key>.webp` (`a e i o u s m l fv r tdn rest`),
  servidos de `/nathalia/expressions/`.
- **Fala simulada**: quando `speaking=true` e **sem** visema de áudio, o avatar
  cicla uma sequência natural de visemas (`VISEME_SEQUENCE`, ~110ms/frame) — o
  "mouth swap". Já satisfaz o critério "simular fala por troca de visemas".
- **Seam de áudio pronto**: o store tem `viseme: string | null` e
  `setNathaliaViseme()`. Se um motor de fala fornecer visemas em tempo real, o
  avatar usa esse visema (preciso) em vez do ciclo.
- **Texto → visema**: `visemeForChar(ch)` mapeia grafemas pt-BR para visemas
  (aproximação grafema, não fonema — lê bem em tamanho de avatar).
- **Adapter de voz**: `nathaliaSpeech.ts` expõe `NathaliaVoiceProvider`,
  `speakNathalia`, `voiceNathalia`, `setNathaliaVoiceProvider` — **interface sem
  provider real** nesta fase (não há acoplamento a TTS).

## Caminho futuro (sem acoplar agora)

### 1. TTS via adapter
Conectar um provider (ex.: OpenAI TTS ou outro) **por trás de
`NathaliaVoiceProvider`**, sem que os componentes saibam qual é. O provider
devolve áudio + (idealmente) marcações de tempo (`onboundary`/word/phoneme
timings) que alimentam `setNathaliaViseme()` para lip-sync sincronizado ao áudio.

### 2. Lip-sync por áudio (Rhubarb)
Para precisão fonética, gerar **mouth cues** a partir do áudio com
**Rhubarb Lip Sync** (ou `rhubarb-lip-sync-wasm` no cliente). O mapeamento
Rhubarb (A–H, X) → nossos visemas:

| Rhubarb | Significado | Nosso visema |
| ------- | ----------- | ------------ |
| A | fechado (p/b/m) | `m` |
| B | levemente aberto (consoantes) | `tdn` / `e` |
| C | aberto (e) | `e` |
| D | bem aberto (a) | `a` |
| E | arredondado leve (o) | `o` |
| F | arredondado (u/w) | `u` |
| G | lábio-dental (f/v) | `fv` |
| H | l | `l` |
| X | repouso | `rest` |

Pipeline: TTS → áudio + transcrição/alinhamento → Rhubarb → cues no tempo →
agendar `setNathaliaViseme()` sincronizado ao `<audio>`.

### 3. Visemas adicionais / arte dedicada
Hoje há um conjunto enxuto. Se a precisão exigir, acrescentar formas de boca
(ex.: separar `tdn` por consoante) seguindo o [`ASSET_GUIDE.md`](./ASSET_GUIDE.md)
e estender `NATHALIA_VISEMES` + adapters.

## Restrições desta fase

- **Não** acoplar OpenAI/TTS/LLM diretamente — só interfaces/adapters.
- O lip-sync simulado **nunca** depende de rede e respeita reduced-motion (para).

## Onde mexer

- Assets: `apps/web/public/nathalia/expressions/vis-*.webp`.
- Catálogo/mapeamento: `nathaliaExpressions.ts` (`NATHALIA_VISEMES`,
  `visemeForChar`, `visemeImageUrl`).
- Ciclo simulado: `NathaliaAvatar2DExpr.tsx` (`VISEME_SEQUENCE`).
- Estado/seam de áudio: `nathaliaStore.ts` (`viseme`, `setNathaliaViseme`,
  `startNathaliaSpeaking`).
- Voz: `nathaliaSpeech.ts` (`NathaliaVoiceProvider`).
