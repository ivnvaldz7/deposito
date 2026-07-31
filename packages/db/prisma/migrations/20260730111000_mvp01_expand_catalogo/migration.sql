-- MVP-01 EXPAND: additive only. Keep activo and nullable codigo/state during rollout.
-- Deployment order is EXPAND -> CODE_LOAD -> MIGRATE -> CONTRACT. CODE_LOAD is
-- an application deployment gate: only an authorized encargado action or catalog
-- import may assign codigo after this migration. It never derives codigo from
-- variante, nombre, IDs, sequences, or fictitious values.
CREATE TYPE "deposito"."EstadoProductoCatalogo" AS ENUM ('PENDIENTE_REVISION', 'ACTIVO', 'INACTIVO');
CREATE TYPE "deposito"."OrigenProductoCatalogo" AS ENUM ('MANUAL', 'IMPORTACION', 'MIGRACION');
CREATE TYPE "deposito"."TipoAuditoriaCatalogo" AS ENUM (
  'CREADO', 'EDITADO', 'CODIGO_ACTUALIZADO', 'NOMBRE_ACTUALIZADO',
  'PRESENTACION_ACTUALIZADA', 'ACTIVADO', 'REACTIVADO', 'DESACTIVADO',
  'IMPORTACION_CREADA', 'IMPORTACION_APROBADA'
);
ALTER TYPE "deposito"."Mercado" ADD VALUE IF NOT EXISTS 'VENEZUELA';

ALTER TABLE "deposito"."productos"
  ADD COLUMN "estado" "deposito"."EstadoProductoCatalogo",
  ADD COLUMN "codigo" TEXT,
  ADD COLUMN "origen" "deposito"."OrigenProductoCatalogo" NOT NULL DEFAULT 'MIGRACION',
  ADD COLUMN "presentacion" INTEGER,
  ADD COLUMN "mercados_habilitados" "deposito"."Mercado"[] NOT NULL DEFAULT ARRAY[]::"deposito"."Mercado"[];

-- Only ACTIVO packaging records require enabled markets during EXPAND/MIGRATE.
-- Legacy pending/inactive rows must survive the estado backfill; CONTRACT tightens this after sanitation.
ALTER TABLE "deposito"."productos"
  ADD CONSTRAINT "productos_mercados_habilitados_categoria_check"
  CHECK (
    ("categoria" IN ('etiqueta', 'estuche') AND (
      "estado" IS DISTINCT FROM 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
      OR cardinality("mercados_habilitados") > 0
    ))
    OR ("categoria" IN ('frasco', 'droga') AND cardinality("mercados_habilitados") = 0)
  ) NOT VALID;

CREATE UNIQUE INDEX "productos_codigo_key" ON "deposito"."productos"("codigo") WHERE "codigo" IS NOT NULL;

CREATE TABLE "deposito"."auditorias_catalogo_producto" (
  "id" TEXT NOT NULL,
  "producto_id" TEXT NOT NULL,
  "tipo" "deposito"."TipoAuditoriaCatalogo" NOT NULL,
  "valor_anterior" JSONB,
  "valor_nuevo" JSONB,
  "usuario_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditorias_catalogo_producto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auditorias_catalogo_producto_producto_id_created_at_idx"
  ON "deposito"."auditorias_catalogo_producto"("producto_id", "created_at");
ALTER TABLE "deposito"."auditorias_catalogo_producto"
  ADD CONSTRAINT "auditorias_catalogo_producto_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deposito"."auditorias_catalogo_producto"
  ADD CONSTRAINT "auditorias_catalogo_producto_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
