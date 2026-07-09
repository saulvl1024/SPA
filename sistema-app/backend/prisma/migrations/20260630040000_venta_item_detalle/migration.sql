-- Detalle en la línea de venta para poder revertir con exactitud al cancelar
ALTER TABLE "SaleItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "meta" JSONB;
