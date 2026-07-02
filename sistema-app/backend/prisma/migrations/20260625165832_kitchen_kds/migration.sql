-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "station" TEXT NOT NULL DEFAULT 'ninguna';

-- AlterTable
ALTER TABLE "TableOrderItem" ADD COLUMN     "kitchen" TEXT NOT NULL DEFAULT 'pendiente',
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "station" TEXT NOT NULL DEFAULT 'ninguna';
