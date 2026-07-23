-- Item 12: torna os tipos de despesa gerenciaveis (cadastro na tela Politica de
-- Reembolso), substituindo o enum ExpenseCategory por um registro ExpenseType.
--
-- Estrategia (preserva 100% dos dados existentes):
--   1. cria a tabela ExpenseType;
--   2. semeia os 13 tipos nativos (system=true) com os MESMOS codigos do enum;
--   3. converte Expense.category e ReimbursementPolicyRule.category de enum para
--      TEXT (os valores ja sao exatamente os codigos, entao ::text preserva);
--   4. remove o tipo enum ExpenseCategory (agora sem uso).
-- Os indices de ReimbursementPolicyRule (unique category + parcial da regra
-- Geral) sao reconstruidos automaticamente pelo ALTER COLUMN ... TYPE.

-- 1. Tabela de registro
CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseType_code_key" ON "ExpenseType"("code");
CREATE INDEX "ExpenseType_active_sortOrder_idx" ON "ExpenseType"("active", "sortOrder");

-- 2. Semear os 13 tipos nativos (ordem = a do enum antigo).
INSERT INTO "ExpenseType" ("id", "code", "label", "active", "system", "sortOrder", "createdAt", "updatedAt") VALUES
    ('etype-mileage',       'MILEAGE_REIMBURSEMENT', 'Reembolso Quilometragem',   true, true,  0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-air-ticket',    'AIR_TICKET',            'Passagem Aérea',            true, true,  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-bus-ticket',    'BUS_TICKET',            'Passagem Rodoviária',       true, true,  2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-certification', 'CERTIFICATION',         'Certificação',              true, true,  3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-accounting',    'ACCOUNTING',            'Accountech/Contabilidade',  true, true,  4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-ride-share',    'RIDE_SHARE',            'Transporte/Uber',           true, true,  5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-courses',       'COURSES_TRAINING',      'Cursos / Capacitação',      true, true,  6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-lodging',       'LODGING',               'Hospedagem',                true, true,  7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-postage',       'POSTAGE',               'Correio',                   true, true,  8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-meals',         'MEALS',                 'Alimentação',               true, true,  9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-peripherals',   'PERIPHERALS',           'Periféricos',               true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-toll',          'TOLL',                  'Pedágio',                   true, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('etype-parking',       'PARKING',               'Estacionamento',            true, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. Converter as colunas de enum para TEXT (valores == codigos, ::text preserva).
ALTER TABLE "Expense" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "ReimbursementPolicyRule" ALTER COLUMN "category" TYPE TEXT USING "category"::text;

-- 4. Remover o enum agora sem uso.
DROP TYPE "ExpenseCategory";
