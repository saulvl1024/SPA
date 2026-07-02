-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
