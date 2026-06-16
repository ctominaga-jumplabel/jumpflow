# NEXT_STEPS

> Roadmap A-H de melhorias por tela **COMPLETO** (2026-06-15, 898 testes verdes).
> Nao ha mais fase de codigo na fila. Itens abaixo sao de SETUP/INFRA (do usuario)
> e validacao, nao implementacao.

## Aplicar quando houver acesso ao DB (`npm run db:deploy` com .env do DB)

Migrations aditivas pendentes (ordem):
1. `20260615120000_expand_billing_charge_type`
2. `20260615130000_add_allocation_skill`
3. `20260615140000_add_client_contact_email`
4. `20260615150000_add_pre_invoice_email_type`
5. `20260615160000_add_nfse_issued_email_type`

## Setup de infra (devops)

- Buckets Supabase privados: `client-logos`, `pre-invoices`, `nfse`.
- NFS-e SP: certificado A1 + credenciais homologacao; envs NFSE_* (ver
  CURRENT_STATE) e registrar um `NfseSigner` real (XMLDSig) via `setNfseSigner`.
- Confirmar envs ja suportadas: CNPJ/CEP (BrasilAPI), EMAIL (Resend), SUPABASE_*.

## Validacao

- Apos aplicar migrations, rodar a app e validar manualmente os fluxos novos
  (horas editar enviado, aprovacoes em massa/reabrir, logo, skill por alocacao,
  encargos CLT, filtros/e-mail de pagamento, pre-fatura, NFS-e em homologacao).
- `jump-payments-agent` deve validar as tabelas de encargos CLT 2026 antes de
  virar instrucao real de pagamento.

## Possiveis proximas fases (radar, nao priorizado)

Ver `BACKLOG.md`: integracoes reais Banco/ERP, people-ops (calendario, revisao
semanal, offboarding), matching de skills por IA.
