CREATE TABLE "ale_bet"."UbicacionStock" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UbicacionStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UbicacionStock_codigo_key" UNIQUE ("codigo")
);

INSERT INTO "ale_bet"."UbicacionStock" ("id", "codigo", "nombre")
VALUES ('stock-location-deposito', 'DEPOSITO', 'Depósito'), ('stock-location-acondicionado', 'ACONDICIONADO', 'Acondicionado')
ON CONFLICT ("codigo") DO NOTHING;

ALTER TABLE "ale_bet"."Lote" ADD CONSTRAINT "Lote_id_productoId_key" UNIQUE ("id", "productoId");

CREATE TABLE "ale_bet"."SaldoStock" (
  "id" TEXT NOT NULL,
  "productoId" TEXT NOT NULL,
  "loteId" TEXT NOT NULL,
  "ubicacionId" TEXT NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaldoStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaldoStock_cantidad_nonnegative" CHECK ("cantidad" >= 0),
  CONSTRAINT "SaldoStock_producto_lote_ubicacion_key" UNIQUE ("productoId", "loteId", "ubicacionId"),
  CONSTRAINT "SaldoStock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaldoStock_lote_producto_fkey" FOREIGN KEY ("loteId", "productoId") REFERENCES "ale_bet"."Lote"("id", "productoId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaldoStock_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ale_bet"."UbicacionStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "ale_bet"."SaldoStock" ("id", "productoId", "loteId", "ubicacionId", "cantidad")
SELECT CONCAT('legacy-deposito-', l."id"), l."productoId", l."id", u."id", l."cajas" * p."unidadesPorCaja" + l."sueltos"
FROM "ale_bet"."Lote" l
JOIN "ale_bet"."Producto" p ON p."id" = l."productoId"
JOIN "ale_bet"."UbicacionStock" u ON u."codigo" = 'DEPOSITO';

ALTER TABLE "ale_bet"."ReservaStock" ADD COLUMN "ubicacionId" TEXT;
UPDATE "ale_bet"."ReservaStock" SET "ubicacionId" = (SELECT "id" FROM "ale_bet"."UbicacionStock" WHERE "codigo" = 'DEPOSITO');
ALTER TABLE "ale_bet"."ReservaStock" ALTER COLUMN "ubicacionId" SET NOT NULL;
ALTER TABLE "ale_bet"."ReservaStock" ADD CONSTRAINT "ReservaStock_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ale_bet"."UbicacionStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ale_bet"."ReservaStock" DROP CONSTRAINT "ReservaStock_itemPedidoId_loteId_key";
ALTER TABLE "ale_bet"."ReservaStock" ADD CONSTRAINT "ReservaStock_item_lote_ubicacion_key" UNIQUE ("itemPedidoId", "loteId", "ubicacionId");

ALTER TYPE "ale_bet"."TipoMovimiento" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA_INTERNA';
ALTER TABLE "ale_bet"."MovimientoStock" ADD COLUMN "origenUbicacionId" TEXT, ADD COLUMN "destinoUbicacionId" TEXT, ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "ale_bet"."MovimientoStock" ADD CONSTRAINT "MovimientoStock_origenUbicacionId_fkey" FOREIGN KEY ("origenUbicacionId") REFERENCES "ale_bet"."UbicacionStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ale_bet"."MovimientoStock" ADD CONSTRAINT "MovimientoStock_destinoUbicacionId_fkey" FOREIGN KEY ("destinoUbicacionId") REFERENCES "ale_bet"."UbicacionStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "MovimientoStock_transfer_idempotency_key" ON "ale_bet"."MovimientoStock" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
