-- CreateIndex
CREATE INDEX "Appointment_start_idx" ON "Appointment"("start");

-- CreateIndex
CREATE INDEX "Appointment_staffId_idx" ON "Appointment"("staffId");

-- CreateIndex
CREATE INDEX "Appointment_clientId_idx" ON "Appointment"("clientId");

-- CreateIndex
CREATE INDEX "ClientPackage_clientId_idx" ON "ClientPackage"("clientId");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "Sale_sessionId_idx" ON "Sale"("sessionId");

-- CreateIndex
CREATE INDEX "Sale_cashierId_idx" ON "Sale"("cashierId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_specialistId_idx" ON "SaleItem"("specialistId");

-- CreateIndex
CREATE INDEX "TableOrderItem_orderId_idx" ON "TableOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "TableOrderItem_kitchen_station_idx" ON "TableOrderItem"("kitchen", "station");
