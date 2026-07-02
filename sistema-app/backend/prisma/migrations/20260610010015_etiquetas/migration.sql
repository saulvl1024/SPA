-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "tagManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'plum',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "minVisits" INTEGER,
    "minSpend" DOUBLE PRECISION,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
