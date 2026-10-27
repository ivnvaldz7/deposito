-- La regularización conserva el motivo y quién cerró la diferencia de producción.
-- El detalle cuantitativo del ajuste queda además auditado en deposito.movimientos.
ALTER TABLE "deposito"."ordenes_produccion"
  ADD COLUMN "motivo_ajuste" TEXT,
  ADD COLUMN "ajustado_por" TEXT,
  ADD COLUMN "ajustado_at" TIMESTAMP(3);
