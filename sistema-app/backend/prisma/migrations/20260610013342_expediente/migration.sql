-- AlterTable
ALTER TABLE "ClinicalRecord" ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "medications" TEXT,
ADD COLUMN     "skinType" TEXT;
