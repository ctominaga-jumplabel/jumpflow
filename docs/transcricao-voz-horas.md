# Transcrição por voz na descrição de Horas (Melhoria #3)

Permite preencher a **Descrição** de um lançamento de Horas falando, em vez de
digitar. O áudio é gravado no navegador (MediaRecorder), enviado a uma server
action e transcrito por um provedor real (**Google Gemini**). Nada é
persistido: a action só devolve o texto para o formulário preencher o campo.

## Arquitetura (reuso do seam existente)

```
TimeEntryForm (cliente)
  └─ ActivityVoiceButton (cliente)            grava áudio (getUserMedia/MediaRecorder)
       └─ transcribeActivityAudio (server action)   requireUser + valida + chama o seam
            └─ transcribeAudio (lib/transcription/transcribe.ts)   flag + mimetype + tamanho
                 └─ getTranscriptionProvider()                     seleciona por env
                      └─ GeminiTranscriptionProvider               fetch real (sem SDK)
```

- O seam (`apps/web/src/lib/transcription/`) já existia; esta entrega só
  implementou o **provider Gemini real**, a **server action** e o **microfone**.
- Degrada honesto em toda falha: flag off → `DISABLED`; sem provedor/credencial,
  HTTP erro, timeout ou candidato vazio → `null`/`NO_RESULT`. O fluxo de digitar
  manualmente nunca quebra.

## Como ATIVAR

Precisa das **duas pontas** (cliente + servidor):

| Variável | Onde | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_TRANSCRIPTION` | cliente | `true` (mostra o microfone) |
| `TRANSCRIPTION_PROVIDER` | servidor | `gemini` |
| `GOOGLE_API_KEY` (ou `GEMINI_API_KEY`) | servidor | chave do Google AI Studio |
| `GEMINI_TRANSCRIPTION_MODEL` | servidor (opcional) | default `gemini-2.0-flash` |

Sem `NEXT_PUBLIC_TRANSCRIPTION=true` o microfone **some** (flag off). Com o
microfone visível mas sem provedor/credencial no servidor, a transcrição
**degrada honesto** (mensagem de indisponível; a descrição segue digitável).

## Chamada ao Gemini (shape exato)

`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

- Header: `x-goog-api-key: <GOOGLE_API_KEY>` (chave fora da URL, não vaza em logs).
- Body:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Transcreva o áudio em português do Brasil. Retorne SOMENTE a transcrição literal..." },
        { "inline_data": { "mime_type": "audio/webm", "data": "<base64 do áudio>" } }
      ]
    }
  ],
  "generationConfig": { "temperature": 0 }
}
```

- Resposta lida: `candidates[0].content.parts[*].text` (concatenado e trim).
- Timeout: 30s via `AbortController`.

## Limite de tamanho (camadas)

Três camadas, do mais restritivo ao mais geral:

1. **Action (feature):** `ACTIVITY_AUDIO_MAX_BYTES = 10 MB`. A
   `transcribeActivityAudio` corta áudio acima disso ANTES de materializar/
   encodar o buffer e devolve `reason: "AUDIO_TOO_LONG"` com mensagem acionável
   ("Áudio muito longo, grave um trecho menor"). A descrição de Horas é fala
   curta, então este teto baixo evita o `NO_RESULT` confuso que o inline do
   Gemini daria para áudio longo. A UI exibe a mensagem honesta.
2. **Seam:** `MAX_AUDIO_BYTES = 25 MB` (defesa-em-profundidade).
3. **Provider (Gemini inline):** `GEMINI_INLINE_MAX_BYTES = 18 MB` decodificado.
   O caminho `inline_data` é para áudios pequenos (a request inteira fica abaixo
   de ~20 MB, e o áudio vai em base64). Acima disso a rota suportada é a **File
   API do Gemini** (`media.upload` + `file_data.file_uri`) — `TODO` no provider;
   hoje áudio acima degrada honesto (retorna `null`).

Na prática a action (10 MB) corta bem antes das camadas 2 e 3.

## Arquivos

- `apps/web/src/lib/transcription/provider.ts` — `GeminiTranscriptionProvider` real.
- `apps/web/src/app/app/horas/actions.ts` — `transcribeActivityAudio`.
- `apps/web/src/components/timesheet/ActivityVoiceButton.tsx` — gravação + UI.
- `apps/web/src/components/timesheet/TimeEntryForm.tsx` — botão sob a Descrição.
