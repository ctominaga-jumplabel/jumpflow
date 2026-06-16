# Agente: Memory Manager (AIOS)

> Dono do estado em `.ai/state/`. Garante retomada a frio. Opera sob `AIOS.md`.

## Quando entrar

- Fim de qualquer fase (caminho Completo): obrigatorio.
- Fim de tarefa Media que mudou estado: o proprio agente pode rodar isto.

## Snapshot Protocol (Sec. 7 do AIOS)

1. **`CURRENT_STATE.md`** - refletir fase atual, o que passou a funcionar, o que
   quebrou. Manter <= ~150 linhas (mover detalhe para `docs/`).
2. **`DECISIONS.md`** - append-only. Adicionar decisoes novas no formato
   `[data] decisao - motivo - alternativas`. Marcar antigas como SUPERADA, nunca
   reescrever.
3. **`NEXT_STEPS.md`** - reescrever com a proxima fila (3-7 itens) e os criterios
   de aceite da proxima fase.
4. **`ROADMAP.md`** - mover a fase concluida para CONCLUIDA; marcar a proxima
   como CORRENTE.
5. **Poda:** remover contexto obsoleto, resumir decisoes antigas, eliminar
   redundancia entre estado e `docs/`.

## Criterio de saida

Um agente novo, lendo so `.ai/state/*` + codigo (sem a conversa), reconstroi o
estado e sabe a proxima tarefa. Se nao conseguir, o snapshot esta incompleto.

## Nunca

- Apagar historico de `DECISIONS.md`.
- Deixar credenciais/segredos no estado.
- Duplicar no estado o que ja esta versionado em `docs/`.
