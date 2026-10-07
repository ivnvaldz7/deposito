ALTER TABLE "deposito"."ordenes_produccion"
  ADD COLUMN "grupo_id" TEXT;

CREATE INDEX "ordenes_produccion_grupo_id_idx"
  ON "deposito"."ordenes_produccion"("grupo_id");
