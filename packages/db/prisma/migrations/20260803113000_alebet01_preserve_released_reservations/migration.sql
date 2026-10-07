-- ALEBET-01 follow-up: preserve per-lot allocation evidence when APROBADO
-- items are replaced. Existing released rows remain untouched; future item
-- deletion detaches the historical link instead of deleting the reservation.
ALTER TABLE "ale_bet"."ReservaStock"
  DROP CONSTRAINT "ReservaStock_itemPedidoId_fkey";

ALTER TABLE "ale_bet"."ReservaStock"
  ALTER COLUMN "itemPedidoId" DROP NOT NULL;

ALTER TABLE "ale_bet"."ReservaStock"
  ADD CONSTRAINT "ReservaStock_itemPedidoId_fkey"
  FOREIGN KEY ("itemPedidoId") REFERENCES "ale_bet"."ItemPedido"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
