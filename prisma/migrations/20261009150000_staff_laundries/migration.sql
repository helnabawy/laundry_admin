-- Staff ↔ laundry assignments. A laundry admin (ADMIN) can run several
-- laundries; a laundry operator (USER) works in exactly one; a super admin
-- in none. Replaces the single StaffUser.vendorId column.

-- CreateTable
CREATE TABLE "StaffVendor" (
    "staffUserId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffVendor_pkey" PRIMARY KEY ("staffUserId","vendorId")
);

-- CreateIndex
CREATE INDEX "StaffVendor_vendorId_idx" ON "StaffVendor"("vendorId");

-- AddForeignKey
ALTER TABLE "StaffVendor" ADD CONSTRAINT "StaffVendor_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffVendor" ADD CONSTRAINT "StaffVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing laundry-scoped staff member keeps their laundry.
INSERT INTO "StaffVendor" ("staffUserId", "vendorId")
SELECT "id", "vendorId" FROM "StaffUser"
WHERE "vendorId" IS NOT NULL AND "role" <> 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "StaffUser" DROP CONSTRAINT "StaffUser_vendorId_fkey";

-- AlterTable
ALTER TABLE "StaffUser" DROP COLUMN "vendorId";
