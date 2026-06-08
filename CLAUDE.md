# JumpFlow - Claude Code Instructions

## Product

JumpFlow is the Jump platform for consultants, time tracking, skills, certificates, project allocation, approvals, hourly values and operational/financial visibility.

The product name is currently `JumpFlow`, but it must stay easy to rename. Prefer reading display name from configuration when possible.

## Sources of Truth

- Product vision: `docs/plataforma-jump-horas.md`
- MVP backlog: `docs/backlog-mvp.md`
- Data model: `docs/modelo-dados.md`
- Architecture: `docs/arquitetura.md`
- Agent guide: `docs/agentes.md`
- Claude subagents: `.claude/agents/`

## Technical Direction

- MVP stack: Next.js, React, TypeScript, Tailwind CSS, Prisma and PostgreSQL.
- Initial hosting: Vercel.
- Initial database: Supabase Postgres.
- Future target: Render + PostgreSQL.
- Docker is not required for local MVP development.
- Use Prisma migrations from the beginning.
- Avoid unnecessary coupling to Supabase-specific features.

## Repository Shape

```text
apps/
  web/
packages/
  database/
  shared/
  ui/
docs/
.claude/
  agents/
```

## Development Rules

- Validate input on the server.
- Use Zod for shared validation schemas.
- Use Prisma as the database access layer.
- Check authorization on the server for all private operations.
- Protect financial fields by role.
- Audit sensitive changes such as approvals, allocations, hourly values, permissions and monthly closings.
- Keep implementation scoped to the current story.
- Prefer simple, migratable choices over early infrastructure complexity.

## Agent Usage

- Use `jump-product-owner` for scope, stories and criteria.
- Use `jump-architect` for architecture and ADR-level decisions.
- Use `jump-data-modeler` before changing Prisma schema or data rules.
- Use `jump-fullstack-engineer` for feature implementation.
- Use `jump-frontend-ux` for screens, flows and usability.
- Use `jump-qa-engineer` for test strategy and critical scenarios.
- Use `jump-devops` for Vercel, Supabase, Render and environments.
- Use `jump-code-reviewer` before finishing meaningful code changes.

For small localized changes, a single agent may be enough. For broad or critical work, orchestrate multiple agents following `docs/agentes.md`.

