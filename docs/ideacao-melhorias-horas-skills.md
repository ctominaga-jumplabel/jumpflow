# Ideacao - Melhorias em Horas e Skills

## Objetivo

Avaliar melhorias vindas da Plataforma de Horas e das necessidades atuais do
JumpFlow, separando o que ja existe, o que existe de outra forma e o que vale
desenhar como evolucao de produto.

Fontes analisadas:

- `CLAUDE.md` anexado da Plataforma de Colaboradores.
- `feedback-assincrono.md`.
- `context_offboarding_gerentes.md`.
- `context_crm_offboarding.md`.
- Estado atual do JumpFlow em schema Prisma, modulos Horas e Skills e backlog.

## Diagnostico rapido do JumpFlow atual

> Atualizacao: a rodada seguinte ja adicionou `TimesheetDefault` e
> `SkillSuggestion` ao schema, com UI/actions iniciais para aplicar padrao da
> semana e gerar/decidir sugestoes de skills. As proximas fases devem consolidar
> testes, UX, persistencia real da matriz e curadoria de catalogo antes de
> expandir para financeiro/lifecycle.

### Horas

O JumpFlow ja tem:

- Lancamentos diarios persistidos em `TimeEntry`.
- Periodo semanal em `TimesheetPeriod`.
- Copia da semana anterior.
- Validacao de alocacao ativa por projeto/data.
- Aprovacao manual e automacao de aprovacao.
- Tipos de atividade canonicos, incluindo `WORKDAY`, `VACATION`, `DAY_OFF`,
  `ABSENCE` e `ON_CALL`.

O JumpFlow ainda nao tem, ou tem apenas em versao inicial:

- Consolidacao completa de testes/preview para default de jornada por alocacao.
- Modelo semanal com confirmacao final e descritivo obrigatorio por projeto.
- Ocorrencias como primeira classe separada de horas.
- Bloqueio por feriados/emendas.
- Aprovacao com cobranca/remuneracao por dia.

### Skills

O JumpFlow ja tem:

- Modelo de dados para `Skill` e `ConsultantSkill`.
- Nivel por skill (`BASIC`, `INTERMEDIATE`, `ADVANCED`, `SPECIALIST`).
- Anos de experiencia e status de validacao no schema.
- Tela visual de matriz de skills, ainda baseada em mock.

O JumpFlow ainda nao tem, ou tem apenas em versao inicial:

- Autosservico real para o consultor editar suas skills.
- Fluxo de sugestao/aprovacao de novas skills.
- Matriz de skills lendo Prisma em vez de mock.
- Curadoria de sugestoes fora do catalogo.
- Motor de IA externa com politica de privacidade, se for necessario.

## Melhoria 1 - Cadastro DEFAULT de horas e aplicar para semana

### Problema

Hoje o consultor ainda precisa registrar horas por dia/projeto/atividade. A
copia da semana anterior ajuda, mas nao resolve bem o primeiro preenchimento,
mudancas de alocacao ou semanas padrao.

### Ideia recomendada

Criar uma configuracao de jornada default por alocacao, nao um default global
solto.

Sugestao de conceito:

- Cada alocacao pode ter um "modelo padrao de apontamento".
- Campos:
  - projeto/alocacao;
  - atividade padrao;
  - horas por dia;
  - dias aplicaveis: segunda a sexta por padrao;
  - faturavel por padrao;
  - descricao padrao opcional;
  - vigencia opcional.
- A tela de Horas ganha uma acao "Aplicar padrao da semana".
- O consultor escolhe quais dias receberao o default antes de salvar/enviar.

### Decisao de produto sugerida

Fazer primeiro uma versao pragmatica:

1. `DEFAULT` por alocacao ativa.
2. Aplicacao apenas em dias uteis da semana exibida.
3. Nao sobrescrever lancamentos ja existentes sem confirmacao.
4. Lancamentos criados entram como `SUBMITTED`, seguindo o comportamento atual
   do JumpFlow.
5. Se houver mais de uma alocacao ativa, cada projeto tem seu proprio default.

Evitar, neste primeiro passo:

- Default global por consultor.
- Ferias/folgas/feriados automaticos.
- Ocorrencias como entidade separada.
- Descritivo semanal obrigatorio.

### Valor

Alto. Reduz atrito semanal e combina com o que o JumpFlow ja tem.

### Risco

Medio. Se o default for amplo demais, pode gerar apontamento automatico
incorreto. Por isso a aplicacao deve ser explicita e revisavel.

## Melhoria 2 - IA para sugerir skills a partir das atividades da semana

### Problema

O cadastro manual de skills tende a ficar incompleto/desatualizado. As
atividades semanais contem sinais reais do que o consultor praticou.

### Ideia recomendada

Criar um fluxo de "Sugestoes de skills da semana" a partir do texto livre dos
lancamentos e, futuramente, do descritivo semanal por projeto.

Fluxo sugerido:

1. No fim da semana, o consultor revisa as atividades realizadas.
2. Aciona "Sugerir skills".
3. IA extrai skills provaveis, nivel sugerido e evidencias.
4. Consultor confirma, ajusta ou descarta.
5. Skills novas entram como sugestao pendente para admin, quando nao existirem
   no catalogo.
6. Skills existentes entram/atualizam `ConsultantSkill` com status pendente de
   validacao, se essa politica estiver ativa.

### Principio importante

A IA nao deve gravar skill final sozinha. Ela deve montar uma proposta
auditavel, com evidencias do texto usado.

Exemplo de sugestao:

- Skill: React.
- Nivel sugerido: Intermediario.
- Evidencia: "Implementacao de componentes e ajustes em fluxo de cadastro".
- Acao: confirmar, alterar nivel, descartar.

### Valor

Muito alto para People, Operacoes e Comercial, porque transforma apontamento em
inventario vivo de capacidades.

### Risco

Medio/alto. Skills sao dado de reputacao profissional; sugestoes ruins podem
incomodar o consultor. A UX precisa deixar claro que e uma proposta, nao uma
avaliacao automatica.

## Outras melhorias mapeadas da Plataforma de Horas

### 1. Modelo semanal com descritivo por projeto

Existe parcialmente: JumpFlow tem periodo semanal, mas as entradas sao diarias.

Recomendacao: evoluir depois do DEFAULT. Primeiro reduzir atrito de input; em
seguida adicionar uma revisao semanal por projeto com resumo/descritivo.

Prioridade: alta, mas depois do default.

### 2. Ocorrencias separadas de horas

Existe de forma diferente: hoje tipos como ferias, ausencia, folga e sobreaviso
aparecem como `activityType`.

Recomendacao: nao migrar agora para uma entidade `Occurrence`. Manter
`activityType` no curto prazo e so separar ocorrencias quando houver feriados,
emendas, remuneracao/cobranca por dia e aprovacao operacional mais rica.

Prioridade: media.

### 3. Calendario de feriados/emendas

Nao existe como regra operacional.

Recomendacao: entra bem junto com o modelo semanal v2, nao como primeira
melhoria. Sem ocorrencias/descritivo semanal, feriado automatico pode criar
mais excecao do que clareza.

Prioridade: media.

### 4. Cobranca e remuneracao por dia

Existe parcialmente: ha `billable` em `TimeEntry`, mas nao ha remuneracao por
dia nem decisao separada na aprovacao.

Recomendacao: alto impacto financeiro, mas maior mudanca de dominio. Ideal
para uma rodada financeira separada.

Prioridade: alta para financeiro, nao bloquear DEFAULT/Skills IA.

### 5. Projeto = proposta/PTC, valor hora venda por alocacao

Existe de forma diferente: JumpFlow ainda tem `billingHourlyRate` no projeto.

Recomendacao: manter como refatoracao de modelo financeiro. E importante, mas
nao deve entrar misturado com melhoria de experiencia do consultor.

Prioridade: alta em trilha financeira.

### 6. Feedback assincrono

Nao existe.

Recomendacao: bom modulo, mas separado do problema de horas/skills. Pode virar
epico proprio de Trocas.

Prioridade: media.

### 7. Protocolo de desligamento/offboarding

Nao existe.

Recomendacao: importante para governanca, mas depende de cadastros/alocacoes e
aprovacoes reais mais maduras. Nao competir com melhorias de apontamento.

Prioridade: media/baixa para o momento.

## Proposta de roadmapping

### Rodada A - DEFAULT de apontamento

Entregar:

- Modelo default por alocacao.
- Acao "Aplicar padrao da semana".
- Preview antes de criar entradas.
- Protecao contra sobrescrita acidental.
- Auditoria da aplicacao do default.

Resultado esperado:

- Menos lancamentos manuais repetitivos.
- Melhor aderencia para consultores em projeto continuo.

### Rodada B - Skills assistidas por IA

Entregar:

- Tela/acao de sugestao a partir das atividades da semana.
- Estrutura de sugestoes pendentes.
- Confirmar/editar/descartar sugestoes.
- Criar sugestao de nova skill quando nao existir no catalogo.

Resultado esperado:

- Matriz de skills mais atualizada.
- Consultor participa da curadoria.
- People/Operacoes ganham evidencias praticas.

### Rodada C - Revisao semanal por projeto

Entregar:

- Resumo semanal por projeto.
- Descritivo semanal.
- Confirmacao final da semana/projeto.
- Base melhor para IA de skills.

Resultado esperado:

- Fluxo mais alinhado a Plataforma de Horas v2.
- Menos dependencia de descricao fragmentada por dia.

### Rodada D - Financeiro operacional

Entregar:

- Separar cobranca e remuneracao.
- Decisao por dia na aprovacao.
- Valor hora venda/remuneracao por alocacao com vigencia.
- Relatorio financeiro granular.

Resultado esperado:

- Fechamento mais confiavel.
- Menos planilha paralela.

## Recomendacao final

Comecar por duas melhorias de alto valor e baixo acoplamento relativo:

1. DEFAULT por alocacao aplicado na semana.
2. Sugestoes de skills por IA com confirmacao humana.

Essas duas melhoram diretamente a vida do consultor e alimentam dados melhores
para Operacoes, sem exigir que a plataforma inteira migre de uma vez para o
modelo semanal v2 completo.
