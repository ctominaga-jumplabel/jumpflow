-- Reembolso Quilometragem (Reembolso por km de carro).
-- Novos campos em Expense usados APENAS quando category = 'MILEAGE_REIMBURSEMENT';
-- ficam NULL/0 nos demais tipos de despesa. amount continua sendo o total
-- (distanceKm * valuePerKm) para milhagem.
ALTER TABLE "Expense" ADD COLUMN "originAddress" TEXT;
ALTER TABLE "Expense" ADD COLUMN "destinationAddress" TEXT;
ALTER TABLE "Expense" ADD COLUMN "roundTrip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN "distanceOutboundKm" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN "distanceReturnKm" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN "distanceKm" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN "valuePerKm" DECIMAL(10,2);

-- Taxa global de R$/km na regra da categoria de milhagem (Politica de
-- Reembolso). NULL nas demais regras.
ALTER TABLE "ReimbursementPolicyRule" ADD COLUMN "valuePerKm" DECIMAL(10,2);
