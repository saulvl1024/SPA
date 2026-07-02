-- Cotizaciones: costo de envío y cortesía
ALTER TABLE "Quote" ADD COLUMN "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN "shippingFree" BOOLEAN NOT NULL DEFAULT false;
