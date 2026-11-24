-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GstEnv" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "pan" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "accountNo" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "gstEnv" "GstEnv" NOT NULL DEFAULT 'SANDBOX',
    "irpClientId" TEXT,
    "irpClientSecret" TEXT,
    "irpUsername" TEXT,
    "irpPassword" TEXT,
    "irpPublicKey" TEXT,
    "ewbClientId" TEXT,
    "ewbClientSecret" TEXT,
    "ewbUsername" TEXT,
    "ewbPassword" TEXT,
    "ewbPublicKey" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "gstin" TEXT,
    "stateName" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsn_codes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "hsn_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "hsnId" INTEGER,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'QTL',
    "gstRate" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transporters" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "transporterGstId" TEXT,
    "mobile" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transporters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "transporterId" INTEGER,
    "vehicleNo" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "placeOfSupply" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "buyerName" TEXT NOT NULL,
    "buyerGstin" TEXT,
    "buyerAddress" TEXT NOT NULL,
    "buyerStateCode" TEXT NOT NULL,
    "taxable" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "bags" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einvoice_records" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "irn" TEXT,
    "ackNo" TEXT,
    "ackDate" TEXT,
    "signedQr" TEXT,
    "signedInvoice" TEXT,
    "portalMessage" TEXT,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "irnInvented" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "einvoice_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eway_bill_records" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "ewayNo" TEXT,
    "generatedAt" TEXT,
    "validUpto" TEXT,
    "vehicleNo" TEXT,
    "distanceKm" INTEGER,
    "portalMessage" TEXT,
    "requestJson" JSONB,
    "responseJson" JSONB,
    "invented" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eway_bill_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_transaction_logs" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_documents" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE INDEX "customers_companyId_name_idx" ON "customers"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hsn_codes_companyId_code_key" ON "hsn_codes"("companyId", "code");

-- CreateIndex
CREATE INDEX "products_companyId_name_idx" ON "products"("companyId", "name");

-- CreateIndex
CREATE INDEX "transporters_companyId_idx" ON "transporters"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_companyId_vehicleNo_key" ON "vehicles"("companyId", "vehicleNo");

-- CreateIndex
CREATE INDEX "sales_invoices_companyId_invoiceDate_idx" ON "sales_invoices"("companyId", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_companyId_financialYear_number_key" ON "sales_invoices"("companyId", "financialYear", "number");

-- CreateIndex
CREATE INDEX "sales_invoice_items_invoiceId_idx" ON "sales_invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "einvoice_records_invoiceId_idx" ON "einvoice_records"("invoiceId");

-- CreateIndex
CREATE INDEX "eway_bill_records_invoiceId_idx" ON "eway_bill_records"("invoiceId");

-- CreateIndex
CREATE INDEX "api_transaction_logs_companyId_createdAt_idx" ON "api_transaction_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_documents_invoiceId_idx" ON "invoice_documents"("invoiceId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsn_codes" ADD CONSTRAINT "hsn_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_hsnId_fkey" FOREIGN KEY ("hsnId") REFERENCES "hsn_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transporters" ADD CONSTRAINT "transporters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einvoice_records" ADD CONSTRAINT "einvoice_records_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eway_bill_records" ADD CONSTRAINT "eway_bill_records_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_transaction_logs" ADD CONSTRAINT "api_transaction_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
