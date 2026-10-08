-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('networkIntl', 'telr', 'tabby', 'cash');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'cancelled', 'expired', 'partiallyRefunded', 'refunded');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('rent', 'salaries', 'utilities', 'supplies', 'fuel', 'maintenance', 'marketing', 'other');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'payLater';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "cardProvider" "PaymentProvider" NOT NULL DEFAULT 'networkIntl';

-- CreateTable
CREATE TABLE "VendorGateway" (
    "vendorId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "feeFixed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(10,2),
    "maxAmount" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorGateway_pkey" PRIMARY KEY ("vendorId","provider")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "checkoutToken" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "collectedById" TEXT,
    "events" JSONB NOT NULL DEFAULT '[]',
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "incurredOn" DATE NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutToken_key" ON "Payment"("checkoutToken");

-- CreateIndex
CREATE INDEX "Payment_vendorId_paidAt_idx" ON "Payment"("vendorId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_vendorId_status_createdAt_idx" ON "Payment"("vendorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "Refund_vendorId_createdAt_idx" ON "Refund"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Expense_vendorId_incurredOn_idx" ON "Expense"("vendorId", "incurredOn");

-- AddForeignKey
ALTER TABLE "VendorGateway" ADD CONSTRAINT "VendorGateway_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default gateway settings for every existing laundry. The fees are
-- placeholders; each laundry enters its contracted rates in the portal.
INSERT INTO "VendorGateway" ("vendorId", "provider", "isEnabled", "feePercent", "feeFixed", "minAmount", "maxAmount", "updatedAt")
SELECT v.id, g.provider::"PaymentProvider", true, g.pct, g.fixed, g.min_amount, g.max_amount, CURRENT_TIMESTAMP
FROM "Vendor" v
CROSS JOIN (VALUES
  ('networkIntl', 2.50, 1.00, NULL::numeric, NULL::numeric),
  ('telr',        2.80, 1.00, NULL, NULL),
  ('tabby',       6.00, 1.00, 50.00, 5000.00),
  ('cash',        0.00, 0.00, NULL, NULL)
) AS g(provider, pct, fixed, min_amount, max_amount);

-- Backfill the ledger: one succeeded payment per invoice already marked paid,
-- so history before this migration still shows up in finance reports.
INSERT INTO "Payment" ("id", "vendorId", "orderId", "invoiceId", "provider", "method", "status",
                       "amount", "feeAmount", "checkoutToken", "paidAt", "createdAt", "updatedAt")
SELECT 'bf_' || i.id, o."vendorId", o.id, i.id,
       CASE WHEN i."paymentMethod" = 'cashOnDelivery' THEN 'cash'::"PaymentProvider" ELSE 'networkIntl'::"PaymentProvider" END,
       COALESCE(i."paymentMethod", 'card'::"PaymentMethod"),
       'succeeded',
       COALESCE((SELECT SUM(it.quantity * it."unitPrice") FROM "InvoiceItem" it WHERE it."invoiceId" = i.id), 0)
         + i."vipSurcharge" + i."codFee",
       0, md5(random()::text || i.id), COALESCE(i."paidAt", i."updatedAt"), COALESCE(i."paidAt", i."updatedAt"), CURRENT_TIMESTAMP
FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId"
WHERE i.paid;
