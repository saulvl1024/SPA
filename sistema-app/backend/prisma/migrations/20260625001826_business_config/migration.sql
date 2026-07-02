-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "businessType" TEXT DEFAULT 'general',
ADD COLUMN     "settings" JSONB;
