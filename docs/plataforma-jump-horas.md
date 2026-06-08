# Plataforma Jump para Gestao de Consultores, Horas e Skills

## 1. Visao do Produto

A plataforma tem como objetivo centralizar a operacao dos consultores da Jump, cobrindo lancamento e aprovacao de horas, gestao de projetos, alocacao, skills, certificados, valores de hora, rentabilidade e capacidade futura.

A ideia nao e criar apenas um sistema de timesheet, mas uma plataforma operacional e estrategica para apoiar consultores, gestores, RH/People, comercial, financeiro e diretoria.

## 2. Objetivos

- Reduzir atrito no lancamento e aprovacao de horas.
- Dar visibilidade sobre alocacao, disponibilidade e capacidade.
- Mapear skills, certificados e senioridade dos consultores.
- Apoiar decisoes comerciais com base em disponibilidade e competencias reais.
- Acompanhar margem, custo, valor hora e rentabilidade por projeto/cliente.
- Criar dados confiaveis para fechamento financeiro e planejamento.
- Apoiar desenvolvimento profissional dos consultores.

## 3. Personas

### Consultor

- Lanca horas.
- Atualiza skills.
- Cadastra certificados.
- Consulta alocacoes, historico e pendencias.
- Acompanha desenvolvimento e trilhas recomendadas.

### Gestor de Projeto

- Aprova ou reprova horas.
- Acompanha consumo de budget.
- Visualiza equipe, alocacao e pendencias.
- Monitora horas planejadas vs realizadas.

### Gestor de Area

- Visualiza capacidade do time.
- Planeja alocacoes.
- Acompanha performance, margem e disponibilidade.
- Identifica riscos de bench ou sobrecarga.

### RH/People

- Mantem dados de consultores.
- Acompanha skills, certificados, senioridade e desenvolvimento.
- Identifica gaps de conhecimento.
- Apoia planos de carreira.

### Comercial

- Busca consultores por skill, senioridade e disponibilidade.
- Planeja propostas com base em capacidade real.
- Consulta historico de experiencia dos consultores.

### Financeiro

- Consulta horas aprovadas para faturamento.
- Acompanha valor hora, custo hora, margem e fechamento mensal.
- Exporta dados para ERP, planilhas ou sistema contabil.

### Diretoria

- Visualiza indicadores consolidados.
- Acompanha rentabilidade, utilizacao, crescimento, capacidade e gaps estrategicos.

### Cliente Externo, Opcional

- Aprova horas.
- Consulta relatorios de projeto.
- Visualiza entregas, consumo contratado e historico.

## 4. Modulos Funcionais

### 4.1 Portal do Consultor

- Lancamento semanal de horas.
- Copiar semana anterior.
- Lancamento por projeto, cliente, atividade e tipo de hora.
- Indicacao de horas faturaveis e nao faturaveis.
- Consulta de pendencias.
- Cadastro de skills.
- Upload e gestao de certificados.
- Historico de projetos.
- Preferencias de atuacao.
- Disponibilidade futura.
- Plano de desenvolvimento.

### 4.2 Gestao de Horas

- Fluxo de aprovacao por projeto, gestor ou cliente.
- Comentarios em lancamentos.
- Reprovacao com justificativa.
- Reenvio apos correcao.
- Controle de fechamento mensal.
- Bloqueio de periodos fechados.
- Alertas de atraso no lancamento.
- Relatorio de horas pendentes.
- Relatorio de horas aprovadas para faturamento.

### 4.3 Cadastro de Projetos

- Cliente.
- Contrato.
- Periodo de execucao.
- Status: proposta, ativo, pausado, encerrado.
- Gestor responsavel.
- Consultores alocados.
- Papel de cada consultor.
- Percentual de alocacao.
- Valor hora vendido.
- Custo hora interno.
- Budget de horas.
- Centro de custo.
- Tecnologias utilizadas.
- Margem estimada e realizada.

### 4.4 Alocacao de Consultores

- Visao de disponibilidade.
- Percentual de alocacao por periodo.
- Busca por skill, senioridade, certificado e experiencia.
- Sugestao de consultores para projeto.
- Conflitos de agenda.
- Previsao de termino de alocacao.
- Pipeline de futuras demandas.
- Identificacao de bench.

### 4.5 Skills e Certificados

- Cadastro de skills tecnicas e comportamentais.
- Nivel por skill: basico, intermediario, avancado, especialista.
- Anos de experiencia.
- Ultima utilizacao.
- Projetos relacionados.
- Validacao por gestor.
- Cadastro de certificados.
- Data de emissao e expiracao.
- Alertas de vencimento.
- Trilhas recomendadas.
- Matriz de skills da empresa.

### 4.6 Financeiro e Rentabilidade

- Valor hora vendido por projeto e consultor.
- Custo hora interno.
- Margem por projeto.
- Margem por cliente.
- Receita prevista vs realizada.
- Horas faturaveis vs nao faturaveis.
- Custo de bench.
- Forecast mensal.
- Fechamento mensal.
- Exportacao para faturamento.

### 4.7 Workflows e Auditoria

- Aprovacao de horas.
- Aprovacao de horas extras.
- Aprovacao de skills declaradas.
- Aprovacao de certificados.
- Aprovacao de alocacao.
- Aprovacao de alteracao de valor hora.
- Historico de alteracoes.
- Registro de usuario, data, status e comentario.

### 4.8 Dashboards

- Dashboard do consultor.
- Dashboard do gestor de projeto.
- Dashboard de RH/People.
- Dashboard comercial.
- Dashboard financeiro.
- Dashboard executivo.
- Indicadores de utilizacao, margem, pendencias, capacidade e skills.

### 4.9 Funcionalidades Inteligentes

- Matching de consultores para projetos.
- Alertas de certificado proximo do vencimento.
- Recomendacao de cursos e certificacoes.
- Deteccao de inconsistencias em horas.
- Forecast de bench.
- Analise de skills mais demandadas.
- Analise de margem por perfil.
- Geracao assistida de relatorio mensal.
- Integracao com Jira, Azure DevOps, GitHub, Microsoft 365 e calendario.

## 5. MVP Proposto

O MVP deve resolver o ciclo operacional essencial:

1. Cadastro de usuarios e perfis.
2. Cadastro de consultores.
3. Cadastro de clientes.
4. Cadastro de projetos.
5. Alocacao de consultores em projetos.
6. Lancamento semanal de horas.
7. Aprovacao e reprovacao de horas.
8. Cadastro de skills.
9. Cadastro de certificados.
10. Dashboard de pendencias.
11. Relatorio mensal de horas aprovadas.

## 6. Arquitetura Sugerida

### 6.1 Estrategia Inicial

Comecar com uma arquitetura modular em um monorepo. Isso reduz atrito no inicio, facilita evolucao rapida e ainda permite separar servicos no futuro caso a plataforma cresca.

Proposta inicial:

- Frontend web.
- Backend API.
- Banco relacional.
- Servico de autenticacao/autorizacao.
- Jobs assicronos para notificacoes, fechamentos e alertas.
- Camada futura de inteligencia e recomendacoes.

### 6.2 Estrategia de Hospedagem

#### MVP

- Aplicacao Next.js publicada na Vercel.
- Banco PostgreSQL no Supabase.
- Prisma como camada de acesso ao banco.
- Desenvolvimento local sem Docker.
- Variaveis de ambiente gerenciadas pela Vercel.
- Deploy automatico a partir do GitHub.

Essa escolha favorece velocidade, baixo custo inicial e menor peso na maquina local.

#### Evolucao Planejada

- Migrar banco para PostgreSQL no Render.
- Avaliar migracao da API para Render, caso seja necessario ter processos persistentes, jobs, workers, filas ou APIs mais longas.
- Manter frontend na Vercel enquanto fizer sentido.
- Separar backend apenas quando houver ganho claro de controle, escala ou manutencao.

#### Cuidados para Facilitar a Migracao

- Usar Prisma migrations desde o inicio.
- Evitar depender de recursos exclusivos do Supabase quando nao forem essenciais.
- Manter regras de negocio no codigo da aplicacao, nao somente no banco.
- Documentar variaveis de ambiente.
- Isolar integracoes externas em modulos proprios.
- Planejar scripts de exportacao/importacao de dados antes da migracao.

### 6.3 Stack Recomendada

#### Frontend

- React com TypeScript.
- Vite ou Next.js.
- Tailwind CSS ou design system proprio.
- TanStack Query para consumo de API.
- React Hook Form para formularios.
- Zod para validacao.

Recomendacao inicial: Next.js se quisermos rotas, SSR futuro, autenticacao integrada e uma base mais completa. Vite se quisermos uma SPA mais simples.

#### Backend

- Node.js com TypeScript.
- NestJS ou Fastify.
- Prisma como ORM.
- PostgreSQL como banco principal.
- Redis para cache e filas leves, se necessario.

Recomendacao inicial: NestJS pela organizacao modular, injecao de dependencias, guards, pipes, testes e padrao empresarial.

#### Banco de Dados

- PostgreSQL.
- Prisma migrations.
- Modelagem relacional forte para auditoria, horas, alocacoes e valores.
- Supabase Postgres no inicio, para acelerar o MVP sem exigir Docker local.
- Migracao futura planejada para PostgreSQL hospedado no Render.

#### Autenticacao

Opcoes:

- Microsoft Entra ID, se a Jump usar Microsoft 365.
- Auth0 ou Clerk, se quisermos acelerar.
- Autenticacao propria com JWT, refresh token e RBAC.

Recomendacao inicial: Microsoft Entra ID se houver ambiente corporativo Microsoft. Caso contrario, Auth0/Clerk para reduzir manutencao.

#### Infraestrutura

- Vercel para deploy inicial da aplicacao Next.js.
- Supabase para banco PostgreSQL inicial.
- GitHub Actions ou Vercel Git Integration para CI/CD inicial.
- Render como destino futuro para backend/API e PostgreSQL.
- Docker nao sera requisito para desenvolvimento local no MVP.

#### Observabilidade

- Logs estruturados.
- Auditoria funcional.
- Sentry para erros frontend/backend.
- OpenTelemetry no futuro.

## 7. Repositorios

### Opcao Recomendada: Monorepo

Repositorio: `jump-consulting-platform`

Estrutura sugerida:

```text
jump-consulting-platform/
  apps/
    web/
    api/
  packages/
    shared/
    database/
    ui/
  docs/
  infra/
  scripts/
```

Vantagens:

- Facilita desenvolvimento inicial.
- Compartilha tipos e validacoes.
- Centraliza CI/CD.
- Reduz custo de coordenacao.

Para o MVP, podemos simplificar ainda mais e iniciar com uma aplicacao Next.js fullstack em `apps/web`, usando rotas de API, Server Actions, Prisma e Supabase Postgres. O modulo `apps/api` pode ficar reservado para uma futura API separada em NestJS ou Fastify, caso a complexidade operacional justifique.

### Opcao Alternativa: Multirepo

- `jump-platform-web`
- `jump-platform-api`
- `jump-platform-infra`
- `jump-platform-shared`

Essa opcao faz sentido se houver times separados, governanca mais rigida ou necessidade de deploys totalmente independentes.

## 8. Dominios do Backend

Modulos iniciais:

- `auth`
- `users`
- `consultants`
- `clients`
- `projects`
- `allocations`
- `timesheets`
- `approvals`
- `skills`
- `certificates`
- `billing`
- `reports`
- `notifications`
- `audit`

## 9. Modelo de Dados Inicial

Entidades principais:

- Usuario.
- Perfil/Papel.
- Consultor.
- Cliente.
- Projeto.
- Contrato.
- Alocacao.
- Lancamento de Hora.
- Periodo de Apontamento.
- Aprovacao.
- Skill.
- Skill do Consultor.
- Certificado.
- Arquivo/Anexo.
- Valor Hora.
- Custo Hora.
- Fechamento Mensal.
- Notificacao.
- Evento de Auditoria.

## 10. Agentes e Skills para Apoiar o Desenvolvimento

### 10.1 Agentes Sugeridos

#### Agente de Produto

Responsavel por:

- transformar ideias em requisitos;
- manter backlog;
- escrever criterios de aceite;
- mapear personas e jornadas;
- priorizar MVP.

#### Agente de Arquitetura

Responsavel por:

- revisar decisoes tecnicas;
- manter diagramas;
- avaliar trade-offs;
- propor padroes de modularizacao;
- cuidar de escalabilidade e seguranca.

#### Agente de Backend

Responsavel por:

- modelagem de dominio;
- APIs;
- regras de negocio;
- permissoes;
- testes de servico.

#### Agente de Frontend/UX

Responsavel por:

- fluxos de tela;
- design system;
- formularios;
- dashboards;
- acessibilidade;
- experiencia de lancamento de horas.

#### Agente de Dados e BI

Responsavel por:

- indicadores;
- relatorios;
- metricas de margem, utilizacao e capacidade;
- modelagem analitica futura.

#### Agente de QA

Responsavel por:

- cenarios de teste;
- testes end-to-end;
- regressao;
- validacao dos fluxos criticos.

#### Agente DevOps

Responsavel por:

- Vercel;
- Render;
- pipelines;
- ambientes;
- deploy;
- observabilidade;
- seguranca operacional.

### 10.2 Skills Internas do Codex a Criar

Podemos criar skills especificas para acelerar trabalho recorrente:

- `jump-product-owner`: requisitos, historias, criterios de aceite e backlog.
- `jump-architect`: decisoes arquiteturais, ADRs, diagramas e padroes.
- `jump-backend`: padroes NestJS, Prisma, testes e regras de dominio.
- `jump-frontend`: padroes React/Next, telas, componentes e UX.
- `jump-qa`: planos de teste, Playwright e cenarios criticos.
- `jump-devops`: Vercel, Render, CI/CD, ambientes e deploy.
- `jump-data-bi`: metricas, dashboards e relatorios.

Essas skills podem registrar padroes da propria Jump e evitar que cada nova conversa recomece do zero.

## 11. Ferramentas por Etapa

### Ideacao e Produto

- Markdown para documentos vivos.
- Mermaid para diagramas.
- Backlog em GitHub Projects, Azure DevOps ou Jira.
- Figma para prototipacao, se necessario.

### Desenvolvimento

- VS Code.
- Node.js.
- TypeScript.
- Next.js ou Vite.
- NestJS.
- Prisma.
- PostgreSQL.
- Supabase Postgres no MVP.

### Qualidade

- Vitest ou Jest.
- Testing Library.
- Playwright.
- ESLint.
- Prettier.
- Zod para validacao de contratos.

### DevOps

- GitHub Actions ou Azure DevOps Pipelines.
- Vercel.
- Render.
- Supabase no MVP.
- Sentry.
- Logs estruturados.

### Integracoes Futuras

- Microsoft 365.
- Jira.
- Azure DevOps.
- GitHub.
- ERP financeiro.
- Power BI.
- Slack ou Microsoft Teams.

## 12. Concorrentes e Referencias Conceituais

Plataformas e categorias a observar:

- Sistemas de timesheet e PSA.
- Plataformas de Professional Services Automation.
- Sistemas de gestao de talentos.
- Ferramentas de resource planning.
- ERPs com modulo de projetos.
- Plataformas como Harvest, Tempo Timesheets, Kimble, Kantata, Certinia, BigTime, Float, Resource Guru e similares.

Pontos de atencao nos concorrentes:

- velocidade de lancamento de horas;
- facilidade de aprovacao;
- qualidade dos dashboards;
- previsao de capacidade;
- integracao com ferramentas de projeto;
- governanca financeira;
- experiencia mobile;
- relatorios para clientes;
- inteligencia para matching de pessoas e projetos.

## 13. Fases de Entrega

### Fase 0: Fundacao

- Definir stack.
- Criar monorepo.
- Configurar ambiente local.
- Criar padroes de codigo.
- Criar documentacao inicial.
- Definir modelo de permissao.

### Fase 1: MVP Operacional

- Usuarios e perfis.
- Consultores.
- Clientes.
- Projetos.
- Alocacoes.
- Lancamento de horas.
- Aprovacao de horas.
- Dashboard de pendencias.
- Relatorio mensal simples.

### Fase 2: Skills e Certificados

- Cadastro de skills.
- Matriz de skills.
- Cadastro de certificados.
- Alertas de vencimento.
- Validacao por gestor.

### Fase 3: Financeiro e Rentabilidade

- Valor hora.
- Custo hora.
- Margem por projeto.
- Fechamento mensal.
- Exportacao para faturamento.
- Dashboards financeiros.

### Fase 4: Planejamento e Inteligencia

- Matching de consultores.
- Forecast de capacidade.
- Forecast de bench.
- Recomendacoes de desenvolvimento.
- Integracoes com Jira, Azure DevOps, GitHub e calendario.

### Fase 5: Portal do Cliente

- Aprovacao externa de horas.
- Relatorios para cliente.
- Visao de consumo contratado.
- Historico de entregas.

## 14. Decisoes Registradas

- Nome inicial da plataforma: JumpFlow.
- O nome deve permanecer facil de alterar por configuracao.
- Deploy inicial na Vercel.
- Banco inicial no Supabase Postgres.
- Migracao futura planejada para Render + PostgreSQL.
- Docker nao sera requisito local para o MVP.

## 15. Decisoes Pendentes

- Provedor de autenticacao.
- Ferramenta de backlog.
- Se o cliente externo entra no MVP ou fica para fase posterior.
- Nivel de detalhe financeiro no MVP.
- Se havera uso mobile nativo ou apenas web responsivo.
- Padrao de aprovacao: gestor interno, cliente, ou ambos.

## 16. Proximos Passos

1. Validar este documento com stakeholders.
2. Definir nome da plataforma.
3. Escolher stack inicial.
4. Criar backlog do MVP.
5. Desenhar modelo de dados inicial.
6. Criar wireframes das telas principais.
7. Criar monorepo.
8. Implementar autenticacao e estrutura base.
9. Implementar primeiro fluxo completo: projeto, alocacao, lancamento e aprovacao de horas.
