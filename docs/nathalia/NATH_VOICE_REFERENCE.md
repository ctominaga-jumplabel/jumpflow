# Nathal.IA - Voz da Nath

## Objetivo

Usar a voz real da Nath como identidade vocal da Nathal.IA, mantendo separadas
duas coisas diferentes:

- uma gravacao pronta, que pode ser tocada como audio estatico;
- uma voz personalizada, que pode sintetizar novas frases a partir de texto.

## Amostra atual

- Fonte local: `audios/PTT-20250610-WA0002.wav`
- Publicacao web: `/nathalia/audio/nath-reference/PTT-20250610-WA0002.mp3`
- Alternativas publicadas: `.opus` e `.wav`
- Duracao: 37,2s
- Formato fonte: PCM 16-bit, mono, 48kHz
- Contrato no codigo: `packages/character-nathalia/src/nathaliaVoiceReference.ts`
- Preview: Lab da Nathal.IA em `/app/dev/nathalia`

## Limite importante

Essa amostra nao faz a Nathal.IA falar qualquer texto sozinha. Ela e apenas uma
referencia auditiva. Para gerar frases novas com a voz da Nath, precisamos usar
um provedor de voz personalizada ou um modelo treinado/licenciado.

## Fluxo recomendado

1. Confirmar consentimento explicito da Nath para uso da voz no produto.
2. Reunir mais amostras limpas, idealmente 3 a 10 minutos de fala natural.
3. Remover ruido, longas pausas, musica, vozes de terceiros e trechos sensiveis.
4. Criar uma voz personalizada em um provedor que aceite amostras consentidas.
5. Gerar as falas curadas de `nathaliaSpeechCatalog` e salvar em cache.
6. Usar geracao sob demanda apenas para respostas livres, com rate-limit.
7. Manter `Web Speech API` como fallback quando a voz personalizada falhar.

## Integracao tecnica esperada

O provider futuro deve implementar `NathaliaVoiceProvider`:

```ts
interface NathaliaVoiceProvider {
  isAvailable(): boolean;
  speak(
    text: string,
    cb: { onStart: () => void; onViseme: (viseme: string) => void; onEnd: () => void },
  ): void;
  cancel(): void;
}
```

Para falas curadas, o ideal e salvar o resultado em
`apps/web/public/nathalia/audio/nath-custom/` usando os mesmos ids do catalogo:

```text
hours-period.mp3
hours-new-entry.mp3
hours-grid.mp3
hours-status.mp3
approvals-queue.mp3
approvals-actions.mp3
```

Depois disso, `audioSrc` em `nathaliaSpeechCatalog.ts` pode apontar para
`/nathalia/audio/nath-custom/<id>.mp3`.
