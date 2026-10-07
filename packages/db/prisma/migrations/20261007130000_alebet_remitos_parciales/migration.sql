ALTER TYPE "ale_bet"."EstadoPedido" ADD VALUE IF NOT EXISTS 'PENDIENTE_PRODUCCION';
ALTER TYPE "ale_bet"."EstadoPedido" ADD VALUE IF NOT EXISTS 'PENDIENTE_PARCIAL';

ALTER TABLE "ale_bet"."Pedido"
  ADD COLUMN IF NOT EXISTS "descuentoPorRemito" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ale_bet"."ItemPedido"
  ADD COLUMN IF NOT EXISTS "cantidadEntregada" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ale_bet"."Remito"
  ADD COLUMN IF NOT EXISTS "descuentoAprobadoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "descuentoAprobadoPor" TEXT;

ALTER TABLE "ale_bet"."MovimientoStock"
  ADD COLUMN IF NOT EXISTS "remitoId" TEXT;

ALTER TABLE "ale_bet"."ReservaStock"
  DROP CONSTRAINT IF EXISTS "ReservaStock_itemPedidoId_loteId_ubicacionId_key";

CREATE INDEX IF NOT EXISTS "ReservaStock_itemPedidoId_loteId_ubicacionId_idx"
  ON "ale_bet"."ReservaStock"("itemPedidoId", "loteId", "ubicacionId");
