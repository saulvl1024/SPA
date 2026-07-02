-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE INDEX "FollowUp_staffId_idx" ON "FollowUp"("staffId");

-- CreateIndex
CREATE INDEX "FollowUp_done_idx" ON "FollowUp"("done");
