-- Materiales auxiliares (prospectos, cajas y tapas) se contabilizan por unidad
-- y se mantienen separados de estuches, etiquetas y frascos.
ALTER TYPE "deposito"."Categoria" ADD VALUE IF NOT EXISTS 'material_empaque';

CREATE TABLE "deposito"."inventario_materiales_empaque" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "articulo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_materiales_empaque_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventario_materiales_empaque_producto_id_key" UNIQUE ("producto_id"),
    CONSTRAINT "chk_inv_materiales_empaque_cantidad_no_negativa" CHECK ("cantidad" >= 0)
);

CREATE INDEX "inventario_materiales_empaque_producto_id_idx"
  ON "deposito"."inventario_materiales_empaque"("producto_id");

ALTER TABLE "deposito"."inventario_materiales_empaque"
  ADD CONSTRAINT "inventario_materiales_empaque_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
