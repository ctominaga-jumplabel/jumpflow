# Nathal.IA — Visão de Produto

## O que é

A **Nathal.IA** é a **companheira de trabalho digital** ("Digital Work
Companion") da plataforma Jump. Não é "só um chatbot": é uma personagem 2D
animada, contextual e expressiva, que **acompanha** a pessoa enquanto ela
trabalha — entende em que tela está, reage com emoção, oferece ajuda no momento
certo e celebra conquistas.

> Chatbot espera ser chamado e responde texto. A Nathal.IA tem **presença**:
> percebe o contexto, antecipa, reage visualmente e conduz — uma colega, não uma
> caixa de busca.

## Princípios

1. **Contextual antes de conversacional.** Ela já sabe onde você está (Horas,
   Aprovações, Projetos, Relatórios…) e adapta mensagem, expressão e sugestões.
2. **Sempre positiva e respeitosa.** Nunca culpa nem "amua". Mesmo em erro/alerta
   permanece atenciosa e encorajadora ("vamos resolver juntos").
3. **Ajuda no momento certo, sem interromper.** Nudges proativos só aparecem
   minimizados; nunca cortam uma conversa em andamento.
4. **Leve e acessível.** Animações funcionais e contidas, respeitando
   `prefers-reduced-motion`. Nada de peso 3D/WebGL.
5. **Privada e segura por padrão.** Toda capacidade sensível passa por RBAC no
   servidor; nesta fase não há LLM nem ação destrutiva.

## A Nathal.IA como produto da plataforma Jump

A Nathal.IA é um **produto transversal**. O **JumpFlow é o primeiro** produto a
adotá-la, mas a personagem e seu motor de comportamento são desenhados para
serem reaproveitados:

- **JumpFlow** (horas, alocação, aprovações, financeiro) — *primeiro adotante*.
- **JumpPM** — gestão de projetos.
- **JumpBase** — base de conhecimento.
- **CRM** — relacionamento e vendas.
- **Financeiro** — cobrança, pagamentos, fiscal.
- **Data / Governança** — insights e qualidade de dados.

Por isso a Nathal.IA mora num **pacote isolado** (`@jumpflow/character-nathalia`)
com contrato estável e desacoplado do app hospedeiro (ver
[`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md)). O nome do produto
hospedeiro é configurável; a personagem é a constante.

## Níveis de presença

| Nível | Forma | Quando |
| ----- | ----- | ------ |
| 1 — Ícone vivo | Launcher com micro-vida (respiro, piscar) | Sempre, minimizado |
| 2 — Nudge contextual | Card curto sobre o launcher | Evento proativo seguro |
| 3 — Painel | Conversa + sugestões + ajuda | Usuário abre |
| 4 — Celebração | Estado `celebrate` transitório (+ confete) | Conquista positiva |

## Experiência-alvo (Fase atual)

- Aparece como **launcher** no canto inferior direito de `/app/*`.
- O usuário abre o **painel**; a expressão muda ao **navegar** e ao **reagir**.
- Pelo menos **uma mensagem contextual por área** (Horas/Aprovações/Projetos/
  Relatórios), vinda do **cérebro local** (sem LLM).
- Fala simulada por **troca de visemas** (lip-sync), pronta para TTS futuro.

## O que ainda NÃO é (escopo desta fase)

- Sem LLM/IA generativa conectada (respostas vêm de FAQ/knowledge locais).
- Sem TTS/áudio real (há apenas a simulação visual de fala).
- Sem 3D.

Esses itens são **caminhos planejados**, atrás de adapters/interfaces — ver
[`ROADMAP.md`](./ROADMAP.md) e [`LIPSYNC_PLAN.md`](./LIPSYNC_PLAN.md).
