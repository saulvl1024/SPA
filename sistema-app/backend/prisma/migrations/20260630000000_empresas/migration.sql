-- Empresas cliente (CRM B2B)
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rfc" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_name_idx" ON "Company"("name");

-- Cliente puede pertenecer a una empresa
ALTER TABLE "Client" ADD COLUMN "companyId" TEXT;

CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
