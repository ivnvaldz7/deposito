CREATE TYPE "ale_bet"."TipoReglaTransferenciaProducto" AS ENUM ('SAME_PRODUCT', 'PRESENTATION');

CREATE TABLE "ale_bet"."ProductoTransferRule" (
  "id" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "targetProductId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "tipo" "ale_bet"."TipoReglaTransferenciaProducto" NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductoTransferRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductoTransferRule_source_target_label_key" UNIQUE ("sourceProductId", "targetProductId", "label"),
  CONSTRAINT "ProductoTransferRule_source_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductoTransferRule_target_fkey" FOREIGN KEY ("targetProductId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductoTransferRule_source_activo_orden_idx"
  ON "ale_bet"."ProductoTransferRule" ("sourceProductId", "activo", "orden");

ALTER TABLE "ale_bet"."Lote" ADD COLUMN "derivedFromLoteId" TEXT;
ALTER TABLE "ale_bet"."Lote" ADD CONSTRAINT "Lote_derivedFromLoteId_fkey"
  FOREIGN KEY ("derivedFromLoteId") REFERENCES "ale_bet"."Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Lote_producto_derived_from_key"
  ON "ale_bet"."Lote" ("productoId", "derivedFromLoteId");
