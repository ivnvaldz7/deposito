-- DEP-V1 lean: solicitud directa de productos reales.
-- This migration may be applied to platform_prod only with explicit user
-- authorization, a prior production backup, a clean preflight, and the
-- production migration procedure. It is intentionally additive. Rebuild
-- discardable DEV/TEST databases that already received the experimental recipes migration.

CREATE TYPE "deposito"."EstadoPartida" AS ENUM ('SOLICITADO', 'CONFIRMADO', 'RECHAZADO');
ALTER TYPE "deposito"."DepositoTipoMovimiento" ADD VALUE IF NOT EXISTS 'egreso_partida';
ALTER TYPE "deposito"."RefTipo" ADD VALUE IF NOT EXISTS 'partida';

CREATE TABLE "deposito"."partidas_produccion" (
    "id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "confirmado_por_id" TEXT,
    "confirmado_at" TIMESTAMP(3),
    "estado" "deposito"."EstadoPartida" NOT NULL DEFAULT 'SOLICITADO',
    "notas" TEXT,
    "motivo_rechazo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partidas_produccion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deposito"."items_solicitud" (
    "id" TEXT NOT NULL,
    "partida_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "mercado" "deposito"."Mercado",
    "cantidad_solicitada" DOUBLE PRECISION NOT NULL,
    "cantidad_final" DOUBLE PRECISION,
    CONSTRAINT "items_solicitud_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partidas_produccion_solicitante_id_idx" ON "deposito"."partidas_produccion"("solicitante_id");
CREATE INDEX "partidas_produccion_confirmado_por_id_idx" ON "deposito"."partidas_produccion"("confirmado_por_id");
CREATE INDEX "partidas_produccion_estado_idx" ON "deposito"."partidas_produccion"("estado");
CREATE INDEX "items_solicitud_partida_id_idx" ON "deposito"."items_solicitud"("partida_id");
CREATE INDEX "items_solicitud_producto_id_idx" ON "deposito"."items_solicitud"("producto_id");

ALTER TABLE "deposito"."partidas_produccion" ADD CONSTRAINT "partidas_produccion_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deposito"."partidas_produccion" ADD CONSTRAINT "partidas_produccion_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "deposito"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deposito"."items_solicitud" ADD CONSTRAINT "items_solicitud_partida_id_fkey" FOREIGN KEY ("partida_id") REFERENCES "deposito"."partidas_produccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deposito"."items_solicitud" ADD CONSTRAINT "items_solicitud_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
