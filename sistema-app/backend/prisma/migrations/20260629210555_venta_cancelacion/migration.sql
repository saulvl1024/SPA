-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidedAt" TIMESTAMP(3);
