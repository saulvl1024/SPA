-- Dos embudos: B2C (consumidor) y B2B (empresas). Las etapas existentes quedan como B2C.
ALTER TABLE "DealStage" ADD COLUMN "pipeline" TEXT NOT NULL DEFAULT 'b2c';
CREATE INDEX "DealStage_pipeline_idx" ON "DealStage"("pipeline");
