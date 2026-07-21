# Nathal.IA — Voz (TTS) e lip-sync

## Hoje

- **Voz natural gravada** (`nathaliaSpeechCatalog.ts` → `speakNathaliaAudio` /
  `voiceNathaliaCached`): arquivos de áudio (`/nathalia/audio/...`) tocados via
  `HTMLAudioElement`, com lip-sync por timer resincronizado à duração do áudio.
  É a **única voz real** da aplicação (ex.: tour de Horas/Aprovações). Botão de
  **mudo** no painel.
- A antiga **voz sintética do navegador (Web Speech API), "robótica", foi
  removida de toda a aplicação.** O provider padrão agora é **silencioso**
  (`SilentVoiceProvider`): falas sem áudio gravado não emitem som (a boca ainda
  anima pelo baseline de timer do store), em vez de cair na TTS sintética.

### Biblioteca de voz gravada (`nathaliaVoiceLibrary.ts`)

Fonte única que mapeia **o que a Nathal.IA diz** → **qual clipe toca**. Contém os
27 clipes do pacote `nath-custom-review` (transcrições do `manifest.json`; exclui
o #27 de consentimento). Como funciona:

- **`voiceNathaliaReply(text, hint)`** (respostas do chat): toca por
  correspondência **exata de texto** (`audioForVoiceText`, normalizada
  p/ emoji/maiúsculas/pontuação); senão por **cue** derivado do `source`
  (`navigation`→08, `fallback`→12) ou do **estado visual**
  (`success/happy/celebrate`→25, `warning`→26, `error`→12); senão silêncio.
- **`voiceNathaliaCue(cue)`** (eventos de produto): `success` / `warning` /
  `not-found` / `navigation` → clipe correspondente. Usado em momentos reais de
  interação (ex.: envio de horas em `TimesheetWeekView` dispara `success`/`warning`).
- **Saudação falada** na 1ª abertura do painel (clipe 07), no `NathaliaProvider`.
- **Tour**: intros (“Me mostre a tela/fila”) usam o clipe 09; passos 01–06 seguem
  no `nathaliaSpeechCatalog`.

Para vocalizar um novo momento: faça o texto exibido ser **igual** a um clipe da
biblioteca, ou chame `voiceNathaliaCue(...)` no evento. Respostas ricas de FAQ que
não têm gravação continuam **silenciosas** (não são substituídas por clipes
genéricos, para não perder conteúdo).

## O seam para voz externa (já no código)

`nathaliaSpeech.ts` expõe a interface `NathaliaVoiceProvider` e
`setNathaliaVoiceProvider(p)`. Trocar a voz é **plugar um provider** — o avatar,
o lip-sync e o mudo não mudam:

```ts
interface NathaliaVoiceProvider {
  isAvailable(): boolean;
  speak(text, { onStart, onViseme, onEnd }): void; // onViseme(key) dirige a boca
  cancel(): void;
}
```

## Opções de voz externa (natural)

| Provedor | Naturalidade | pt-BR | Lip-sync | Custo | Observação |
| --- | --- | --- | --- | --- | --- |
| **ElevenLabs** | ★★★★★ | ✅ | timing por caractere/palavra | $$ | A mais expressiva/realista; permite **voz própria** (clonada) p/ a marca |
| **Azure AI Speech (Neural)** | ★★★★☆ | ✅ (Francisca, Brenda…) | **eventos de visema nativos** | $ | Melhor custo-benefício **para lip-sync** — manda os visemas prontos |
| **OpenAI TTS** (`gpt-4o-mini-tts`) | ★★★★☆ | ✅ | só áudio (aproximar visema) | $ | API simples, tom controlável por instrução |
| **Google Cloud TTS** (Neural2/Studio) | ★★★★☆ | ✅ | timepoints via SSML `<mark>` | $ | Sólido e barato |
| **AWS Polly Neural** | ★★★☆☆ | ✅ (Camila, Vitória) | **speech marks** (visema/palavra) | $ | Barato; speech marks ajudam o lip-sync |

**Recomendação:**
- Quer **lip-sync perfeito** com baixo custo → **Azure Neural** (entrega visemas
  com timestamp; mapeamos direto para nossos `vis-*`).
- Quer a **voz mais natural / identidade de marca** → **ElevenLabs** (e dá para
  criar uma voz exclusiva da Nathal.IA).

## Arquitetura recomendada (forma natural, segura e barata)

1. **Rota server** `app/api/nathalia/tts` — guarda a API key no servidor (nunca
   no client), aplica **RBAC + rate-limit + teto de custo**. Recebe `{ text }`,
   chama o provedor, devolve **áudio (mp3)** + (quando houver) **timeline de
   visemas/timepoints**.
2. **`CloudVoiceProvider implements NathaliaVoiceProvider`** no client: faz
   `fetch` da rota, toca o áudio com um `HTMLAudioElement`, e chama `onViseme`
   seguindo a timeline (Azure/Polly) ou aproximando pelos tempos de palavra +
   nosso `visemeForChar`. Registra com `setNathaliaVoiceProvider(new CloudVoiceProvider())`.
3. **Pré-gerar o áudio das respostas curadas** (FAQ + knowledge são
   **determinísticos**!) em build/seed → cache em storage (Supabase/CDN). Assim:
   custo ~zero em runtime, latência zero, e a fala combina 100% com o lip-sync.
   Só perguntas livres caem no caminho on-demand (ou ficam no Web Speech).
4. **Cache** por hash do texto (memória + storage) para não repagar a mesma fala.
5. **Naturalidade:** usar **SSML** (prosódia, pausas, ênfase), escolher uma voz
   **feminina pt-BR quente**, `rate`/`pitch` levemente acima, respeitar o tom da
   Character Bible (frases curtas, acolhedoras). Manter respostas curtas.

## Migração (sem dor)

- **Agora:** voz natural gravada para as falas curadas; demais falas silenciosas
  (sem TTS robótica). O seam `NathaliaVoiceProvider` segue disponível.
- **Quando quiser natural on-demand:** criar a rota `tts` + `CloudVoiceProvider` e chamar
  `setNathaliaVoiceProvider(...)` no boot do client (atrás de uma flag, ex.
  `NEXT_PUBLIC_NATHALIA_VOICE=azure`). **Nada** no avatar/lip-sync/mudo muda.
- **Privacidade/custo:** o texto vai a um terceiro — para respostas curadas,
  pré-gerar evita exposição e custo; para texto livre, avaliar consentimento.

## Próximo passo sugerido

Começar pela **Azure Neural** (melhor relação lip-sync × custo) **pré-gerando o
áudio das respostas curadas** e plugando o `CloudVoiceProvider`. Se a prioridade
for uma voz-marca inconfundível, **ElevenLabs** com voz dedicada.
