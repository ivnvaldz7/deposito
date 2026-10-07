ALTER TABLE "ale_bet"."Pedido"
  ADD COLUMN "esRemitoManual" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Pedido_esRemitoManual_estado_idx"
  ON "ale_bet"."Pedido"("esRemitoManual", "estado");
