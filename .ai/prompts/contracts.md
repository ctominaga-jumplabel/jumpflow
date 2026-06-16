# Prompt Contracts

Modelos curtos e reutilizaveis. Copie e ajuste a tarefa.

## Iniciar sessao
> Leia `.ai/state/CURRENT_STATE.md` e `.ai/state/NEXT_STEPS.md`. Nao leia mais
> nada ainda. Diga em 3 linhas onde estamos e qual a proxima tarefa.

## Executar tarefa (leve/medio)
> Tarefa: [X]. Leia so os arquivos necessarios (cite por caminho). Classifique
> leve/medio/completo (Sec. 5 do AIOS) e siga o caminho. Confirme no schema
> Prisma antes de criar do zero. Nao recopie o que ja esta em `DECISIONS.md`.
> Ao terminar, rode lint/typecheck/test e atualize `CURRENT_STATE.md`.

## Orquestrar fase (completo)
> Aja como Orchestrator (`.ai/agents/orchestrator.md`). Leia CURRENT_STATE +
> NEXT_STEPS + ROADMAP. Quebre a fase [N] em subtarefas com dono `jump-*`,
> arquivos-alvo e aceite. Schema primeiro. Depois reviewer e QA. Encerre com o
> Memory Manager.

## Revisar
> Revise o diff da tarefa [X] contra os Quality Gates (Sec. 9 do AIOS) com
> `jump-code-reviewer`. Aponte riscos (RBAC, auditoria, financeiro). Nao aprove
> sem teste.

## Encerrar fase
> Aja como Memory Manager (`.ai/agents/memory-manager.md`). Rode o Snapshot
> Protocol (Sec. 7): atualize CURRENT_STATE, DECISIONS (append), NEXT_STEPS,
> ROADMAP. Pode contexto obsoleto. Confirme retomada a frio.
