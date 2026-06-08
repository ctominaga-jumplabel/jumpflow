# Backlog MVP - Plataforma Jump

## 1. Objetivo do MVP

Entregar o primeiro ciclo operacional completo da plataforma:

1. Cadastrar consultores, clientes e projetos.
2. Alocar consultores em projetos.
3. Permitir lancamento semanal de horas.
4. Permitir aprovacao/reprovacao de horas.
5. Registrar skills e certificados.
6. Gerar visao de pendencias e relatorio mensal para fechamento.

## 2. Perfis do MVP

- Admin.
- Consultor.
- Gestor de Projeto.
- Gestor de Area.
- Financeiro.
- RH/People.

## 3. Epicos

### EP01 - Autenticacao e Perfis

Permitir que usuarios acessem a plataforma com papeis e permissoes adequados.

#### US01.01 - Login

Como usuario, quero acessar a plataforma com minhas credenciais para usar as funcionalidades do meu perfil.

Critérios de aceite:

- O usuario consegue entrar e sair da plataforma.
- A sessao expirada redireciona para login.
- Usuarios nao autenticados nao acessam areas privadas.

#### US01.02 - Controle de Perfis

Como admin, quero atribuir perfis aos usuarios para controlar permissoes.

Critérios de aceite:

- Admin pode atribuir um ou mais perfis a um usuario.
- Perfil define quais modulos o usuario pode acessar.
- Acesso indevido retorna erro ou redirecionamento apropriado.

### EP02 - Cadastro de Consultores

Manter dados dos consultores que serao alocados em projetos.

#### US02.01 - Criar Consultor

Como RH/People, quero cadastrar consultores para disponibiliza-los na plataforma.

Critérios de aceite:

- Cadastro exige nome, email, status e senioridade.
- Email deve ser unico.
- Consultor criado fica disponivel para alocacao se estiver ativo.

#### US02.02 - Editar Consultor

Como RH/People, quero atualizar dados do consultor para manter o cadastro correto.

Critérios de aceite:

- E possivel editar senioridade, cargo, area, status e dados de contato.
- Alteracoes relevantes geram evento de auditoria.
- Consultor inativo nao pode receber nova alocacao.

### EP03 - Cadastro de Clientes

Manter clientes vinculados aos projetos.

#### US03.01 - Criar Cliente

Como gestor, quero cadastrar clientes para associar projetos e contratos.

Critérios de aceite:

- Cadastro exige nome e status.
- Nome do cliente nao pode ser vazio.
- Cliente inativo nao pode receber novos projetos ativos.

### EP04 - Cadastro de Projetos

Permitir criacao e acompanhamento dos projetos da Jump.

#### US04.01 - Criar Projeto

Como gestor de projeto, quero criar projetos para organizar alocacoes e horas.

Critérios de aceite:

- Projeto exige cliente, nome, status, data de inicio e gestor responsavel.
- Projeto pode ter data de fim opcional.
- Projeto ativo pode receber alocacoes e lancamentos.

#### US04.02 - Definir Dados Financeiros do Projeto

Como financeiro, quero informar valor hora e budget para acompanhar faturamento.

Critérios de aceite:

- Projeto pode ter valor hora vendido.
- Projeto pode ter budget de horas.
- Alteracoes financeiras geram auditoria.

### EP05 - Alocacao de Consultores

Permitir alocar consultores em projetos com periodo, papel e percentual.

#### US05.01 - Criar Alocacao

Como gestor de area, quero alocar consultores em projetos para planejar capacidade.

Critérios de aceite:

- Alocacao exige consultor, projeto, periodo, papel e percentual.
- Percentual deve ser maior que 0 e menor ou igual a 100.
- Sistema deve alertar quando consultor ultrapassar 100% no mesmo periodo.

#### US05.02 - Visualizar Disponibilidade

Como gestor de area, quero visualizar disponibilidade para decidir alocacoes.

Critérios de aceite:

- Lista mostra consultores ativos e percentual alocado no periodo.
- E possivel filtrar por senioridade e skill.
- Consultores sem alocacao aparecem como disponiveis.

### EP06 - Lancamento de Horas

Permitir que consultores registrem horas trabalhadas.

#### US06.01 - Lancar Horas Semanais

Como consultor, quero lancar horas por semana para registrar meu trabalho.

Critérios de aceite:

- Lancamento exige projeto, data, quantidade de horas e tipo de atividade.
- Horas devem ser maiores que 0.
- Consultor so pode lancar horas em projetos onde possui alocacao ativa, salvo permissao administrativa.
- Lancamentos ficam com status rascunho ou enviado.

#### US06.02 - Copiar Semana Anterior

Como consultor, quero copiar a semana anterior para acelerar o apontamento.

Critérios de aceite:

- Sistema copia projetos e atividades da semana anterior.
- Horas copiadas podem ser editadas antes do envio.
- Nao copia lancamentos de projetos encerrados.

#### US06.03 - Enviar Horas para Aprovacao

Como consultor, quero enviar minhas horas para aprovacao quando terminar o preenchimento.

Critérios de aceite:

- Apenas lancamentos validos podem ser enviados.
- Depois do envio, consultor nao altera o lancamento sem reabertura.
- Gestor responsavel recebe pendencia de aprovacao.

### EP07 - Aprovacao de Horas

Permitir que gestores aprovem ou reprovem horas.

#### US07.01 - Aprovar Horas

Como gestor de projeto, quero aprovar horas para liberar fechamento financeiro.

Critérios de aceite:

- Gestor visualiza horas pendentes por projeto e periodo.
- Gestor pode aprovar lancamentos individualmente ou em lote.
- Lancamentos aprovados ficam disponiveis para relatorio financeiro.

#### US07.02 - Reprovar Horas

Como gestor de projeto, quero reprovar horas com justificativa para solicitar correcao.

Critérios de aceite:

- Reprovacao exige comentario.
- Consultor recebe a pendencia de correcao.
- Lancamento reprovado pode ser corrigido e reenviado.

### EP08 - Skills

Permitir cadastrar e consultar competencias dos consultores.

#### US08.01 - Cadastrar Skill do Consultor

Como consultor, quero registrar minhas skills para apoiar alocacoes.

Critérios de aceite:

- Skill exige nome, nivel e anos de experiencia.
- Nivel deve ser basico, intermediario, avancado ou especialista.
- Skill declarada fica pendente de validacao quando configurado.

#### US08.02 - Buscar Consultores por Skill

Como gestor/comercial, quero buscar consultores por skill para encontrar perfis adequados.

Critérios de aceite:

- E possivel filtrar por skill, nivel e senioridade.
- Resultado mostra disponibilidade resumida.
- Resultado mostra certificados relacionados, quando houver.

### EP09 - Certificados

Permitir cadastro e acompanhamento de certificados.

#### US09.01 - Cadastrar Certificado

Como consultor, quero cadastrar certificados para comprovar qualificacoes.

Critérios de aceite:

- Certificado exige nome, emissor e data de emissao.
- Data de expiracao e opcional.
- E possivel anexar comprovante.

#### US09.02 - Alertar Vencimento

Como RH/People, quero identificar certificados proximos do vencimento.

Critérios de aceite:

- Dashboard mostra certificados vencidos e proximos do vencimento.
- O periodo de alerta deve ser configuravel.
- Certificados sem data de expiracao nao aparecem como vencidos.

### EP10 - Dashboards e Relatorios

Dar visibilidade sobre pendencias, horas e fechamento.

#### US10.01 - Dashboard de Pendencias

Como usuario, quero ver minhas pendencias para agir rapidamente.

Critérios de aceite:

- Consultor ve horas nao enviadas, horas reprovadas e certificados pendentes.
- Gestor ve horas pendentes de aprovacao.
- Financeiro ve horas aprovadas ainda nao fechadas.

#### US10.02 - Relatorio Mensal de Horas

Como financeiro, quero gerar relatorio mensal de horas aprovadas para faturamento.

Critérios de aceite:

- Relatorio filtra por cliente, projeto, consultor e periodo.
- Relatorio inclui horas aprovadas, valor hora e total estimado.
- Relatorio pode ser exportado em CSV no MVP.

## 4. Fora do MVP

- Portal externo do cliente.
- Matching automatico com IA.
- Integracoes com Jira, Azure DevOps, GitHub e calendario.
- App mobile nativo.
- Workflow financeiro completo de nota fiscal.
- Power BI embarcado.
- Filas e jobs complexos.

## 5. Criterios Gerais de Pronto

- Funcionalidade implementada com validacao no servidor.
- Permissoes aplicadas conforme perfil.
- Erros tratados com mensagem clara.
- Dados relevantes auditados.
- Testes cobrindo regras criticas.
- Fluxo validado manualmente em ambiente local e publicado.

