ALTER TABLE "companies" ADD COLUMN "integrationMode" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "companies" ADD COLUMN "shortageMode" TEXT NOT NULL DEFAULT 'QUANTITY';
ALTER TABLE "companies" ADD COLUMN "bardanaMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "companies" ADD COLUMN "bardanaRate" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_invoices" ADD COLUMN "buyerCity" TEXT NOT NULL DEFAULT '';
ALTER TABLE "sales_invoices" ADD COLUMN "buyerPincode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "sales_invoices" ADD COLUMN "sellerStateCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "sales_invoices" ADD COLUMN "shortageMode" TEXT NOT NULL DEFAULT 'QUANTITY';
ALTER TABLE "sales_invoices" ADD COLUMN "bardanaMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "sales_invoices" ADD COLUMN "bardanaRate" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoices" ADD COLUMN "transporterName" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN "transporterGstId" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN "vehicleNo" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN "transportMode" TEXT NOT NULL DEFAULT 'ROAD';
ALTER TABLE "sales_invoices" ADD COLUMN "distanceKm" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN "lrNumber" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN "einvoiceState" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN "ewayState" TEXT;

ALTER TABLE "sales_invoice_items" ADD COLUMN "quantityUnit" TEXT NOT NULL DEFAULT 'QTL';
ALTER TABLE "sales_invoice_items" ADD COLUMN "billedQty" DECIMAL(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoice_items" ADD COLUMN "rateUnit" TEXT NOT NULL DEFAULT 'QTL';
ALTER TABLE "sales_invoice_items" ADD COLUMN "shortageQty" DECIMAL(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoice_items" ADD COLUMN "shortageAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoice_items" ADD COLUMN "bardana" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "einvoice_records" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "einvoice_records" ADD COLUMN "requestHash" TEXT;

ALTER TABLE "eway_bill_records" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "eway_bill_records" ADD COLUMN "transportMode" TEXT;
ALTER TABLE "eway_bill_records" ADD COLUMN "transporterName" TEXT;
ALTER TABLE "eway_bill_records" ADD COLUMN "lrNumber" TEXT;
