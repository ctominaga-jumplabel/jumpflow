# Nathal.IA — Voz (TTS) e lip-sync

## Hoje (Fase 9.4)

- **Web Speech API** do navegador (`nathaliaSpeech.ts`): grátis, zero-config,
  **pt-BR**, sem servidor. Fala toda resposta da Nathal e **dirige o lip-sync
  pelo áudio real** via `onboundary` (cada caractere → visema; resincroniza nas
  fronteiras de palavra). Botão de **mudo** no painel.
- **Limitação:** a naturalidade depende das vozes instaladas no SO do usuário
  (no Windows costuma ser a "Maria" pt-BR) — funcional, mas **robótica**.

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

- **Agora:** Web Speech (já entregue) — grátis, funciona, lip-sync por fonema.
- **Quando quiser natural:** criar a rota `tts` + `CloudVoiceProvider` e chamar
  `setNathaliaVoiceProvider(...)` no boot do client (atrás de uma flag, ex.
  `NEXT_PUBLIC_NATHALIA_VOICE=azure`). **Nada** no avatar/lip-sync/mudo muda.
- **Privacidade/custo:** o texto vai a um terceiro — para respostas curadas,
  pré-gerar evita exposição e custo; para texto livre, avaliar consentimento.

## Próximo passo sugerido

Começar pela **Azure Neural** (melhor relação lip-sync × custo) **pré-gerando o
áudio das respostas curadas** e plugando o `CloudVoiceProvider`. Se a prioridade
for uma voz-marca inconfundível, **ElevenLabs** com voz dedicada.
