-- Leftover from a reverted experiment on some dev databases.
ALTER TABLE "Vendor" DROP COLUMN IF EXISTS "appAccent";

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "addressAr" TEXT,
ADD COLUMN     "addressEn" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "city" TEXT;

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "mobileUserId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_mobileUserId_idx" ON "DeviceToken"("mobileUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_invoicePrefix_key" ON "Vendor"("invoicePrefix");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_mobileUserId_fkey" FOREIGN KEY ("mobileUserId") REFERENCES "MobileUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

