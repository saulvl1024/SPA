-- DropForeignKey
ALTER TABLE "TableOrder" DROP CONSTRAINT "TableOrder_tableId_fkey";

-- AlterTable
ALTER TABLE "TableOrder" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'mesa',
ALTER COLUMN "tableId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TableOrder" ADD CONSTRAINT "TableOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
