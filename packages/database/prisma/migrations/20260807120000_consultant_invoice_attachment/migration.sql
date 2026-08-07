-- NF do consultor: (1) anexo do arquivo da nota (bucket privado, URL assinada),
-- seguindo o padrao de ExpenseAttachment; (2) valor declarado na NF em
-- ConsultantPayment para comparacao (a regra de divergencia vive no backend).

-- AlterTable: valor declarado da NF (null enquanto nao informado).
ALTER TABLE "ConsultantPayment" ADD COLUMN "invoiceAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "ConsultantInvoiceAttachment" (
    "id" TEXT NOT NULL,
    "consultantPaymentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantInvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantInvoiceAttachment_consultantPaymentId_idx" ON "ConsultantInvoiceAttachment"("consultantPaymentId");

-- CreateIndex
CREATE INDEX "ConsultantInvoiceAttachment_uploadedByUserId_idx" ON "ConsultantInvoiceAttachment"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "ConsultantInvoiceAttachment" ADD CONSTRAINT "ConsultantInvoiceAttachment_consultantPaymentId_fkey" FOREIGN KEY ("consultantPaymentId") REFERENCES "ConsultantPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantInvoiceAttachment" ADD CONSTRAINT "ConsultantInvoiceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
