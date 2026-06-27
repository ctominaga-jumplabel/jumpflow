# Nathal.IA — Roadmap

## Onde estamos

Companheira **2D animada** funcional no JumpFlow: launcher + bubble + painel,
avatar de expressões ilustradas com piscar e lip-sync simulado, cérebro local
sem LLM (intent/FAQ/knowledge/proactive), mensagens contextuais por área, RBAC
no servidor e um Lab de desenvolvimento (`/app/dev/nathalia`). 3D descontinuado
e arquivado.

## Próximos passos

### Curto prazo — solidez 2D
- Arte final recortada para todas as expressões/visemas (substituir o que ainda
  for provisório) — ver [`ASSET_GUIDE.md`](./ASSET_GUIDE.md).
- Mais mensagens contextuais e sugestões por área; afinar nudges proativos.
- Cobertura de testes do engine/aliases e do Lab.
- Limpeza dos módulos legados de dados (`nathaliaAnimations`/`Accessories`/
  `VisualStates`) — reavaliar o que ainda faz sentido no mundo 2D.

### Em andamento — animação vetorial interativa (Rive)
**Rive** é o caminho para evoluir além do crossfade de PNGs: animações vetoriais
interativas com *state machine*, blink/visemas de verdade e peso baixo.

**Integração já feita (scaffolding):** `NathaliaAvatarRiveLazy` +
`NathaliaAvatarRive` (runtime `@rive-app/react-canvas`, lazy), config/contrato em
`nathaliaRive.ts`, dirigido pelo store (mood/speaking/viseme), atrás da flag
`NEXT_PUBLIC_NATHALIA_RIVE`, com fallback no avatar 2D. `NathaliaAvatar` continua
sendo o ponto único de troca de renderer.

**Falta (bloqueio):** o arquivo **`nathalia.riv`** autorado no editor do Rive —
não é gerado por código. Contrato de autoria em [`RIVE_SPEC.md`](./RIVE_SPEC.md);
colocar em `apps/web/public/nathalia/rive/nathalia.riv` e ligar a flag.

> **PixiJS** só entra se houver necessidade real de animação 2D mais avançada
> (partículas/efeitos performáticos via WebGL/WebGPU). Não é necessário agora.

### Médio prazo — voz e lip-sync por áudio
- TTS via adapter (`NathaliaVoiceProvider`), sem acoplar provider.
- Lip-sync por áudio com **Rhubarb** / `rhubarb-lip-sync-wasm`.
- Detalhes em [`LIPSYNC_PLAN.md`](./LIPSYNC_PLAN.md).

### Médio/longo prazo — inteligência real
- Trocar/aumentar o cérebro local por um LLM real **atrás do
  `KnowledgeProvider`/provider de chat**, mantendo RBAC no servidor e ações
  seguras (sem escrita sem confirmação).
- Ações navegacionais → ações operacionais auditadas (com confirmação e RBAC).

### Longo prazo — Nathal.IA além do JumpFlow
Reaproveitar o pacote `@jumpflow/character-nathalia` em **JumpPM, JumpBase, CRM,
Financeiro e Data/Governança** (ver [`PRODUCT_VISION.md`](./PRODUCT_VISION.md)).
Requer: catálogo de contexto extensível por produto, copy/knowledge por domínio e
nome do host configurável.

## Restrições permanentes

- **Sem 3D / Three.js** no runtime.
- LLM/TTS sempre atrás de adapter/interface.
- Animação funcional e contida; reduced-motion respeitado.
- Não quebrar telas nem regras de negócio do host.
