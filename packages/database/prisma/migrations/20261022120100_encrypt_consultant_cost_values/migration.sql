-- Grupo "Dados Sensíveis" (parte 2/2) + criptografia dos valores de recebimento
-- do consultor.
--
-- 1. Cria o grupo de sistema SENSITIVE_DATA ("Dados Sensíveis"), SEM membros:
--    o ADMIN adiciona as pessoas pela tela de Acessos. É o ÚNICO grupo que vê e
--    edita o custo do consultor (valor hora de custo e valores acordados).
-- 2. Converte as colunas de valores do consultor de NUMERIC para TEXT, para
--    receberem o texto cifrado (AES-256-GCM, chave FIELD_ENCRYPTION_KEY, fora do
--    banco). A conversão mantém o valor atual em texto puro; o app ainda lê esse
--    formato legado, e o script `packages/database/scripts/encrypt-sensitive-values.mjs`
--    deve rodar LOGO APÓS o deploy para cifrar tudo (idempotente).
--
-- Idempotente quanto ao grupo (ON CONFLICT). Não remove dados.

INSERT INTO "Role" ("id", "name", "key", "label", "description", "active", "isSystem", "createdAt", "updatedAt")
VALUES (
  'role_sensitive_data',
  'SENSITIVE_DATA',
  'SENSITIVE_DATA',
  'Dados Sensíveis',
  'Único grupo com acesso (ver/editar) ao custo do consultor: valor hora de custo e valores acordados.',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Consultant"
  ALTER COLUMN "hourlyCost" SET DATA TYPE TEXT USING "hourlyCost"::text;

ALTER TABLE "ConsultantCompensation"
  ALTER COLUMN "hourlyRate" SET DATA TYPE TEXT USING "hourlyRate"::text,
  ALTER COLUMN "cltAmount" SET DATA TYPE TEXT USING "cltAmount"::text,
  ALTER COLUMN "pjAmount" SET DATA TYPE TEXT USING "pjAmount"::text,
  ALTER COLUMN "benefitCardAmount" SET DATA TYPE TEXT USING "benefitCardAmount"::text;

ALTER TABLE "ConsultantBenefit"
  ALTER COLUMN "amount" SET DATA TYPE TEXT USING "amount"::text;

ALTER TABLE "ConsultantAllocationCostRate"
  ALTER COLUMN "hourlyCost" SET DATA TYPE TEXT USING "hourlyCost"::text;

ALTER TABLE "ConsultantProjectRate"
  ALTER COLUMN "hourlyRate" SET DATA TYPE TEXT USING "hourlyRate"::text;

ALTER TABLE "ConsultantAdHocPayment"
  ALTER COLUMN "amount" SET DATA TYPE TEXT USING "amount"::text;
