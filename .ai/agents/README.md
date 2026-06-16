# .ai/agents

Camada de orquestracao do AIOS. **Nao duplica** os agentes de dominio.

- `orchestrator.md` - planeja, classifica, delega, valida (caminho Completo).
- `memory-manager.md` - snapshot e poda do `.ai/state/`.

Os agentes que **executam** o trabalho de dominio vivem em `.claude/agents/`
(23 agentes `jump-*`) e sao invocados via Task tool. O mapa dominio -> agente
esta na Secao 6 do `AIOS.md` e em `docs/agentes.md`.

Specialist = `jump-*` por dominio. Reviewer = `jump-code-reviewer`.
QA = `jump-qa-engineer`.
