-- AUTOMATION-01 Slice 1. This migration is deliberately additive: PostgreSQL
-- remains the source of truth and no existing stock/order data is rewritten.

CREATE TYPE "ale_bet"."EstadoOrderInterpretationDraft" AS ENUM ('DRAFT', 'READY', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "ale_bet"."EstadoStockProjectionOutbox" AS ENUM ('PENDING', 'SYNCED', 'ERROR');

CREATE TABLE "ale_bet"."OrderInterpretationDraft" (
  "id" TEXT NOT NULL,
  "originalText" TEXT NOT NULL,
  "proposedSnapshot" JSONB NOT NULL,
  "editedSnapshot" JSONB,
  "estado" "ale_bet"."EstadoOrderInterpretationDraft" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "confirmedBy" TEXT,
  "pedidoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderInterpretationDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ale_bet"."StockProjectionOutbox" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "causeType" TEXT NOT NULL,
  "causeId" TEXT NOT NULL,
  "estado" "ale_bet"."EstadoStockProjectionOutbox" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockProjectionOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderInterpretationDraft_pedidoId_key" ON "ale_bet"."OrderInterpretationDraft"("pedidoId");
CREATE INDEX "OrderInterpretationDraft_estado_createdAt_idx" ON "ale_bet"."OrderInterpretationDraft"("estado", "createdAt");
CREATE UNIQUE INDEX "StockProjectionOutbox_productId_causeType_causeId_key" ON "ale_bet"."StockProjectionOutbox"("productId", "causeType", "causeId");
CREATE INDEX "StockProjectionOutbox_estado_nextRetryAt_idx" ON "ale_bet"."StockProjectionOutbox"("estado", "nextRetryAt");
CREATE INDEX "StockProjectionOutbox_causeType_causeId_idx" ON "ale_bet"."StockProjectionOutbox"("causeType", "causeId");

ALTER TABLE "ale_bet"."OrderInterpretationDraft"
  ADD CONSTRAINT "OrderInterpretationDraft_pedidoId_fkey"
  FOREIGN KEY ("pedidoId") REFERENCES "ale_bet"."Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ale_bet"."StockProjectionOutbox"
  ADD CONSTRAINT "StockProjectionOutbox_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
