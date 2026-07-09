-- Propina en la venta (no cuenta como ingreso; se paga al personal)
ALTER TABLE "Sale" ADD COLUMN "tip" DOUBLE PRECISION NOT NULL DEFAULT 0;
