# Nathal.IA Voice and 2D Evolution

## Objetivo

Evoluir a Nathal.IA de uma presença visual com videos curtos para uma assistente 2D controlavel, com falas naturais, roteiro contextual, memoria de interacao e lip sync preciso.

## Fase 1 - Voz contextual validavel

Status: implementada como base local.

- Criar catalogo unico de falas por tela e ponto da interface.
- Usar o catalogo no tour guiado para evitar textos duplicados.
- Tocar a fala quando cada ponto do tour aparece.
- Usar audio cacheado gerado com `edge-tts` e voz `pt-BR-FranciscaNeural`.
- Manter Web Speech API do navegador apenas como fallback.
- Manter controle de mute no painel da Nathal.IA.
- Usar `speaking` e `viseme` no store como contrato de lip sync futuro.
- Publicar a amostra real da voz da Nath como referencia auditiva no Lab.

Arquivos principais:

- `packages/character-nathalia/src/nathaliaSpeechCatalog.ts`
- `packages/character-nathalia/src/nathaliaSpeech.ts`
- `packages/character-nathalia/src/nathaliaVoiceReference.ts`
- `packages/character-nathalia/src/NathaliaTour.tsx`
- `scripts/nathalia/generate_edge_tts_audio.py`
- `apps/web/public/nathalia/audio/nath-reference`
- `apps/web/public/nathalia/audio/pt-BR-FranciscaNeural`

Amostra da Nath:

- Fonte local: `audios/PTT-20250610-WA0002.wav`
- Publicacao web: `/nathalia/audio/nath-reference/PTT-20250610-WA0002.mp3`
- Duracao: 37,2s
- Uso atual: referencia auditiva e material de consentimento para voz personalizada.
- Limite: essa gravacao nao gera novas frases sozinha; para a Nathal.IA falar qualquer
  texto com essa voz, sera necessario um provedor de voz personalizada ou um modelo
  treinado/licenciado.

Para regenerar os audios:

```bash
python -m pip install edge-tts
python scripts/nathalia/generate_edge_tts_audio.py
```

Limite atual:

- A voz natural vem de arquivos MP3 cacheados.
- A boca dos videos nao e editavel frame a frame.
- O lip sync visual perfeito depende de avatar 2D em camadas.

## Fase 2 - Catalogo completo de roteiros

- Expandir `nathaliaSpeechCatalog` para todas as telas principais.
- Separar falas por momento: boas-vindas, tour, alerta, sucesso, explicacao e erro.
- Adicionar ids estaveis para analytics e cache de audio.
- Padronizar tamanho das falas: baloes curtos, explicacoes longas apenas no painel.

## Fase 3 - Cache de audio

- Gerar audio pre-processado por `speechPoint.id`.
- Salvar arquivos em `public/nathalia/audio`.
- Tocar audio cacheado antes de cair para Web Speech API.
- Permitir troca de voz sem alterar a UI.

## Fase 4 - Provedor TTS natural

Opcoes futuras:

- OpenAI Text-to-Speech
- ElevenLabs
- Azure Speech
- Google Cloud TTS

Para usar a propria voz da Nath em falas novas, priorizar provedores com voz
personalizada/clonagem consentida. O arquivo `PTT-20250610-WA0002.wav` deve entrar
como amostra de referencia, nunca como substituto direto do TTS dinamico.

Contrato esperado:

- Entrada: texto, idioma, voz, emocao.
- Saida: audio, duracao, marcadores de palavra/fonema quando disponiveis.

## Fase 5 - Lip sync aproximado com audio

- Usar amplitude e eventos de palavra para alternar visemas.
- Manter `speaking=true` enquanto o audio toca.
- Usar `viseme` no store para conduzir boca em componentes que suportem camadas.

## Fase 6 - Evolucao dos videos para frames

Esta fase transforma os videos atuais do Google Flow em base para um avatar 2D mais livre.

Passos:

- Extrair frames limpos dos videos WebM com alpha.
- Selecionar keyframes por postura: idle, apontando, sucesso, alerta, explicando.
- Recortar e normalizar escala, pivots e alinhamento do corpo.
- Separar visualmente corpo, cabeca, olhos, boca, bracos e acessorios quando possivel.
- Gerar spritesheets ou sequencias PNG/WebP por estado.
- Criar manifest com dimensoes, origem, anchor points e duracao.

Resultado esperado:

- Nathal.IA deixa de depender de videos fechados.
- Podemos combinar corpo, rosto, boca e gestos livremente.
- Novas cenas podem ser montadas por codigo sem gerar novo video inteiro.

## Fase 7 - Avatar 2D em camadas

- Corpo base.
- Cabeca/rosto.
- Olhos e sobrancelhas.
- Boca por visema.
- Bracos/maos por pose.
- Objetos de contexto.

Essa fase habilita lip sync real e expressoes independentes.

## Fase 8 - Lip sync perfeito

- Mapear audio para fonemas/visemas.
- Sincronizar timeline da boca com o audio.
- Suportar visemas principais: rest, A, E, I, O, U, M/B/P, F/V, L, S, etc.
- Usar fallback ciclico quando o provedor nao entregar marcadores.

## Fase 9 - Motor de cena

- Posicionar Nathal.IA em relacao ao componente destacado.
- Controlar olhar, gesto, fala e baloes por timeline.
- Evitar sobreposicao com componentes importantes.
- Permitir cenas como "explicar filtro", "celebrar envio" e "alertar pendencia".

## Fase 10 - Inteligencia conectada a ferramentas

- Telemetria de uso das falas.
- Analytics de tours iniciados/concluidos.
- Ferramentas reais do produto.
- Memoria curta de contexto.
- LLM apenas quando os fluxos deterministas ja estiverem medidos.

## Recomendacao

Manter a Fase 1 simples para validar percepcao de valor. O proximo salto tecnico relevante nao e colocar LLM, e sim transformar os videos em um avatar 2D controlavel por camadas.
